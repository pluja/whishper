package server

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/kataras/iris/v12"
	"github.com/pluja/anysub/db"
	"github.com/pluja/anysub/ent"
	"github.com/pluja/anysub/ent/transcription"
	"github.com/pluja/anysub/ent/translation"
	"github.com/pluja/anysub/models"
	subs "github.com/pluja/anysub/utils/subtitles"
)

func (s *Server) listTranscriptions(c iris.Context) {
	client := db.Client()
	var tss []*ent.Transcription
	var err error
	tss, err = client.Transcription.Query().Order(ent.Desc(transcription.FieldCreatedAt)).All(context.Background())
	if err != nil {
		c.StatusCode(iris.StatusInternalServerError)
		c.JSON(iris.Map{"error": err.Error()})
		return
	}
	jsonFormat := c.URLParamDefault("json", "")

	// For each transcription, generate an HTML element, to return for HTMX
	htmlElements := make([]map[string]interface{}, len(tss))
	for i, ts := range tss {
		htmlElements[i] = map[string]interface{}{
			"ID":        ts.ID,
			"Status":    ts.Status,
			"Diarize":   ts.Diarize,
			"Language":  ts.Language,
			"Task":      ts.Task,
			"Device":    ts.Device,
			"ModelSize": ts.ModelSize,
			"SourceUrl": ts.SourceUrl,
			"FileName":  ts.FileName,
			"Result":    ts.Result,
			"CreatedAt": ts.CreatedAt,
		}
	}

	if jsonFormat != "" {
		c.JSON(tss)
		return
	}
	err = c.View("partials/tx_list", iris.Map{"Transcriptions": htmlElements})
	if err != nil {
		c.StatusCode(iris.StatusInternalServerError)
		c.JSON(iris.Map{"error": err.Error()})
		return
	}
}

func (s *Server) getTranscriptionByID(c iris.Context) {
	id, err := c.Params().GetInt("id")
	if err != nil {
		c.StopWithError(iris.StatusBadRequest, errors.New("invalid id"))
		return
	}

	tx, err := db.Client().Transcription.Query().
		Where(transcription.ID(id)).
		WithTranslations(). // Include the "Comments" edge
		Only(context.Background())
	if err != nil {
		c.StopWithError(iris.StatusBadRequest, err)
		return
	}

	c.JSON(tx)
}

func (s *Server) getTranscriptionStatusByID(c iris.Context) {
	id, err := c.Params().GetInt("id")
	if err != nil {
		c.StopWithError(iris.StatusBadRequest, errors.New("invalid id"))
		return
	}

	tx, err := db.Client().Transcription.Get(c, id)
	if err != nil {
		c.StopWithError(iris.StatusNotFound, err)
		return
	}

	c.JSON(iris.Map{"ID": tx.ID, "status": tx.Status})
}

func (s *Server) getTranscriptionSubtitles(c iris.Context) {
	id, err := c.Params().GetInt("id")
	if err != nil {
		c.StopWithError(iris.StatusBadRequest, fmt.Errorf("invalid parameter 'id': %v", err))
		return
	}

	language := strings.ToLower(c.URLParamDefault("language", ""))

	var result models.TranscriptionResult
	switch language {
	case "":
		tx, err := db.Client().Transcription.Get(context.Background(), id)
		if err != nil {
			c.StopWithError(iris.StatusNotFound, err)
			return
		}
		result = tx.Result
	default:
		tx, err := db.Client().Transcription.Query().
			Where(transcription.IDEQ(id)).
			WithTranslations(func(q *ent.TranslationQuery) {
				q.Where(translation.TargetLanguageEQ(language))
			}).
			Only(context.Background())
		if err != nil {
			c.StopWithError(iris.StatusNotFound, err)
			return
		}
		if len(tx.Edges.Translations) == 0 {
			c.StopWithError(iris.StatusNotFound, fmt.Errorf("no translation found for %q language", language))
			return
		}
		result = tx.Edges.Translations[0].Result
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
