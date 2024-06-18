package server

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/kataras/iris/v12"
	"github.com/kataras/iris/v12/sessions"
	"github.com/rs/zerolog/log"

	"github.com/pluja/anysub/db"
	"github.com/pluja/anysub/ent"
	"github.com/pluja/anysub/ent/transcription"
	"github.com/pluja/anysub/models"
	"github.com/pluja/anysub/tasks"
	"github.com/pluja/anysub/utils"
	"github.com/pluja/anysub/utils/translations"
)

func (s *Server) createTranscription(c iris.Context) {
	session := sessions.Get(c)
	uid := session.Get("user").(int)
	// Request parameters (form)
	language := strings.ToLower(c.FormValueDefault("language", c.URLParamDefault("language", "auto")))
	device := strings.ToLower(c.FormValueDefault("device", c.URLParamDefault("device", "cpu")))
	modelSize := strings.ToLower(c.FormValueDefault("modelSize", c.URLParamDefault("modelSize", "small")))
	diarize_text := strings.ToLower(c.FormValueDefault("diarize", c.URLParamDefault("diarize", "on")))
	diarize := (diarize_text == "on" || diarize_text == "true")
	log.Debug().Msgf("Diarize: %v", diarize)
	htmxFormat := c.URLParamDefault("htmx", "")

	// File handling
	c.SetMaxRequestBodySize(20 * iris.GB)

	// single file
	var err error
	_, fileHeader, err := c.FormFile("file")
	if err != nil {
		log.Error().Err(err).Msg("error")
		HandleError(c, err)
		return
	}

	safeFileName := fmt.Sprintf("%s-%s", uuid.New().String()[:6], utils.SecureFilename(fileHeader.Filename))
	// Upload the file to specific destination.
	dest := filepath.Join(utils.Getenv("UPLOAD_DIR", "/app/uploads"), safeFileName)
	c.SaveFormFile(fileHeader, dest)

	// Speakers
	speakerMin := c.URLParamInt64Default("speaker_min", -1)
	speakerMax := c.URLParamInt64Default("speaker_max", -1)

	if speakerMin > 0 && speakerMax > 0 && speakerMin > speakerMax {
		speakerMin, speakerMax = speakerMax, speakerMin
	}

	client := db.Client()

	var tx *ent.Transcription
	txCreate := client.Transcription.Create().
		SetLanguage(language).
		SetDevice(device).
		SetModelSize(modelSize).
		SetDiarize(diarize).
		SetFileName(safeFileName).
		SetStatus(models.TsStatusPending).
		SetUserID(uid)

	if speakerMax > 0 {
		txCreate.SetSpeakerMin(speakerMin)
	}
	if speakerMin > 0 {
		txCreate.SetSpeakerMin(speakerMin)
	}

	tx, err = txCreate.Save(context.Background())
	if err != nil {
		client.Transcription.UpdateOneID(tx.ID).SetStatus(models.TsStatusError).Save(context.Background())
		HandleError(c, err)
		return
	}

	task, err := tasks.NewTranscriptionTask(*tx)
	if err != nil {
		client.Transcription.UpdateOneID(tx.ID).SetStatus(models.TsStatusError).Save(context.Background())
		HandleError(c, err)
		return
	}
	info, err := s.TaskClient.Enqueue(task)
	if err != nil {
		client.Transcription.UpdateOneID(tx.ID).SetStatus(models.TsStatusError).Save(context.Background())
		HandleError(c, err)
		return
	}
	log.Printf("enqueued task: id=%s queue=%s", info.ID, info.Queue)

	//worker.NewTranscriptionChannel <- true
	if htmxFormat != "" {
		// Return html if htmx url parameter
		err = c.View("partials/tx_card", *tx)
		if err != nil {
			c.StatusCode(iris.StatusInternalServerError)
			c.JSON(iris.Map{"error": err.Error()})
			return
		}
		return
	}

	// Return the service as JSON
	c.JSON(tx)
}

func (s *Server) createTranslationTask(c iris.Context) {
	// Validate all required parameters at the beginning
	langTo := strings.ToLower(c.FormValueDefault("langTo", c.URLParamDefault("langTo", "en")))
	htmxFormat := c.URLParamDefault("htmx", "")

	id, err := c.Params().GetInt("id")
	if err != nil {
		HandleError(c, err, iris.StatusBadRequest)
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
		HandleError(c, err, iris.StatusNotFound)
		return
	}

	// Check if a translation for langTo already exists in the transcription
	for _, tl := range transcription.Edges.Translations {
		if tl.TargetLanguage == langTo {
			// Delete this translation, since it will be overwritten with the new one.
			err = db.Client().Translation.DeleteOneID(tl.ID).Exec(ctx)
			if err != nil {
				HandleError(c, err)
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
		HandleError(c, err)
		return
	}

	// Add the translation to the transcription as edge
	_, err = db.Client().Transcription.
		UpdateOneID(transcription.ID).
		AddTranslations(tk).
		Save(ctx)
	if err != nil {
		HandleError(c, err)
		return
	}

	transcription.Status = models.TsStatusTranslating

	// Issue a translation request to the translation service
	go translations.MakeTranslation(tk, transcription.ID)
	if htmxFormat != "" {
		// return html for use with htmx
		err = c.View("partials/tx_card", *transcription)
		if err != nil {
			c.StatusCode(iris.StatusInternalServerError)
			c.JSON(iris.Map{"error": err.Error()})
			return
		}
		return
	}

	// Return json
	c.JSON(transcription)
}
