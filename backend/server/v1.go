package server

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"github.com/duke-git/lancet/v2/convertor"
	"github.com/google/uuid"
	"github.com/kataras/iris/v12"
	"github.com/pluja/anysub/db"
	"github.com/pluja/anysub/ent"
	"github.com/pluja/anysub/ent/transcription"
	"github.com/pluja/anysub/ent/translation"
	"github.com/pluja/anysub/models"
	"github.com/pluja/anysub/utils"
	subs "github.com/pluja/anysub/utils/subtitles"
	"github.com/pluja/anysub/utils/translations"
	"github.com/pluja/anysub/worker"
)

func (s *Server) createTranscription(c iris.Context) {
	language := strings.ToLower(c.URLParamDefault("lang", "auto"))
	device := strings.ToLower(c.URLParamDefault("device", "cpu"))
	modelSize := strings.ToLower(c.URLParamDefault("modelSize", "small"))
	diarize := strings.ToLower(c.URLParamDefault("diarize", "false"))

	// File handling
	c.SetMaxRequestBodySize(20 * iris.GB)

	// single file
	var err error
	_, fileHeader, err := c.FormFile("file")
	if err != nil {
		c.StopWithError(iris.StatusBadRequest, err)
		return
	}

	safeFileName := fmt.Sprintf("%s-%s", uuid.New().String()[:6], utils.SecureFilename(fileHeader.Filename))
	// Upload the file to specific destination.
	dest := filepath.Join("../uploads", safeFileName)
	c.SaveFormFile(fileHeader, dest)

	var diarizeBool bool
	if diarizeBool, err = convertor.ToBool(diarize); err != nil {
		diarizeBool = false
	}

	client := db.Client()

	var ts *ent.Transcription
	ts, err = client.Transcription.Create().
		SetLanguage(language).
		SetDevice(device).
		SetModelSize(modelSize).
		SetDiarize(diarizeBool).
		SetFileName(safeFileName).
		SetStatus(models.TsStatusPending).
		Save(context.Background())

	if err != nil {
		c.StopWithError(iris.StatusInternalServerError, err)
		return
	}

	// Return the service as JSON
	worker.NewTranscriptionChannel <- true
	c.JSON(ts)
}

func (s *Server) listTranscriptions(c iris.Context) {
	client := db.Client()
	tss, err := client.Transcription.Query().All(context.Background())
	if err != nil {
		c.StatusCode(iris.StatusInternalServerError)
		c.JSON(iris.Map{"error": err.Error()})
		return
	}

	c.JSON(tss)
}

func (s *Server) getTranscriptionByID(c iris.Context) {
	id, err := c.Params().GetInt("id")
	if err != nil {
		c.StatusCode(iris.StatusBadRequest)
		c.JSON(iris.Map{"error": "invalid id"})
		return
	}

	transcription, err := db.Client().Transcription.Query().
		Where(transcription.ID(id)).
		WithTranslations(). // Include the "Comments" edge
		Only(context.Background())
	if err != nil {
		status := iris.StatusInternalServerError
		if ent.IsNotFound(err) {
			status = iris.StatusNotFound
		}
		c.StatusCode(status)
		c.JSON(iris.Map{"error": err.Error()})
		return
	}

	c.JSON(transcription)
}

func (s *Server) getTranscriptionStatusByID(c iris.Context) {
	id, err := c.Params().GetInt("id")
	if err != nil {
		c.StatusCode(iris.StatusBadRequest)
		c.JSON(iris.Map{"error": "invalid id"})
		return
	}

	transcription, err := db.Client().Transcription.Get(c, id)
	if err != nil {
		status := iris.StatusInternalServerError
		if ent.IsNotFound(err) {
			status = iris.StatusNotFound
		}
		c.StatusCode(status)
		c.JSON(iris.Map{"error": err.Error()})
		return
	}

	c.JSON(iris.Map{"ID": transcription.ID, "status": transcription.Status})
}

func (s *Server) getTranscriptionSubtitles(c iris.Context) {
	id, err := c.Params().GetInt("id")
	if err != nil {
		handleError(c, fmt.Errorf("invalid parameter 'id': %v", err), iris.StatusBadRequest)
		return
	}

	language := strings.ToLower(c.URLParamDefault("language", ""))

	var result models.TranscriptionResult
	switch language {
	case "":
		txp, err := db.Client().Transcription.Get(context.Background(), id)
		if err != nil {
			handleError(c, err, iris.StatusNotFound)
			return
		}
		result = txp.Result
	default:
		txp, err := db.Client().Transcription.Query().
			Where(transcription.IDEQ(id)).
			WithTranslations(func(q *ent.TranslationQuery) {
				q.Where(translation.TargetLanguageEQ(language))
			}).
			Only(context.Background())
		if err != nil {
			handleError(c, err, iris.StatusNotFound)
			return
		}
		if len(txp.Edges.Translations) == 0 {
			handleError(c, fmt.Errorf("no translation found for %q language", language), iris.StatusNotFound)
			return
		}
		result = txp.Edges.Translations[0].Result
	}

	mlc := c.URLParamIntDefault("mlc", 40)
	mtg := c.URLParamInt64Default("mtg", 900)
	msd := c.URLParamInt64Default("msd", -15)
	colorizeSpeakers := c.URLParamBoolDefault("colorize", true)
	format := strings.ToLower(c.URLParamDefault("format", "vtt"))

	subsConfig := subs.SubtitleConfig{
		MaxLengthChars:   mlc,
		ColorizeSpeakers: colorizeSpeakers,
		SpeakerColors:    map[string]string{},
		MaxTimeGap:       mtg,
		MsDelay:          msd,
	}

	var subtitles string
	contentType := "text/plain"
	switch format {
	case "vtt":
		subtitles = subs.GenerateSubsVTT(result, subsConfig)
		contentType = "text/vtt"
	case "ass":
		subtitles = subs.GenerateSubsASS(result, subsConfig)
		contentType = "text/ass"
	}
	c.ContentType(contentType)
	_, _ = c.Write([]byte(subtitles))
}

func (s *Server) createTranslationTask(c iris.Context) {
	// Validate all required parameters at the beginning
	langTo := c.Params().GetString("langTo")
	if langTo == "" {
		handleError(c, fmt.Errorf("a language code must be provided"), iris.StatusBadRequest)
		return
	}

	id, err := c.Params().GetInt("id")
	if err != nil {
		handleError(c, err, iris.StatusBadRequest)
		return
	}

	// Context with timeout for database operations
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Get the transcription from the database
	transcription, err := db.Client().Transcription.Query().
		Where(transcription.ID(id)).
		WithTranslations(). // Include the "Comments" edge
		Only(context.Background())
	if err != nil {
		handleError(c, err, iris.StatusNotFound)
		return
	}

	// Check if a translation for langTo already exists in the transcription
	for _, tl := range transcription.Edges.Translations {
		if tl.TargetLanguage == langTo {
			// Delete this translation, since it will be overwritten with the new one.
			err = db.Client().Translation.DeleteOneID(tl.ID).Exec(ctx)
			if err != nil {
				handleError(c, err, iris.StatusInternalServerError)
				return
			}
		}
	}

	// Create a new translation
	tk, err := db.Client().Translation.
		Create().
		SetSourceLanguage(transcription.Language).
		SetTargetLanguage(langTo).
		SetStatus(models.TsStatusPending).
		SetResult(transcription.Result).
		Save(ctx)
	if err != nil {
		handleError(c, err, iris.StatusInternalServerError)
		return
	}

	// Add the translation to the transcription as edge
	_, err = db.Client().Transcription.
		UpdateOneID(transcription.ID).
		AddTranslations(tk).
		Save(ctx)
	if err != nil {
		handleError(c, err, iris.StatusInternalServerError)
		return
	}

	// Issue a translation request to the translation service
	go translations.Translate(tk, transcription.ID)

	c.JSON(iris.Map{"ID": transcription.ID, "status": tk.Status})
}

func handleError(c iris.Context, err error, status int) {
	if ent.IsNotFound(err) {
		status = iris.StatusNotFound
	}
	c.StatusCode(status)
	c.JSON(iris.Map{"error": err.Error()})
}
