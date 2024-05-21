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
	"github.com/pluja/anysub/models"
	subs "github.com/pluja/anysub/utils/subtitles"
)

func (s *Server) listTranscriptions(c iris.Context) {
	client := db.Client()
	var tss []*ent.Transcription
	var err error
	tss, err = client.Transcription.Query().Order(ent.Desc(transcription.FieldCreatedAt)).WithTranslations().All(context.Background())
	if err != nil {
		c.StatusCode(iris.StatusInternalServerError)
		c.JSON(iris.Map{"error": err.Error()})
		return
	}
	htmxFormat := c.URLParamDefault("htmx", "")

	if htmxFormat != "" {
		err = c.View("partials/tx_list", iris.Map{"Transcriptions": tss})
		if err != nil {
			c.StatusCode(iris.StatusInternalServerError)
			c.JSON(iris.Map{"error": err.Error()})
			return
		}
		return
	}

	c.JSON(tss)
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
	var filename string

	tx, err := db.Client().Transcription.Query().
		Where(transcription.IDEQ(id)).
		WithTranslations().
		Only(context.Background())
	if err != nil {
		c.StopWithError(iris.StatusNotFound, err)
		return
	}

	filename = tx.FileName
	switch language {
	case "":
		result = tx.Result
	default:
		if len(tx.Edges.Translations) == 0 {
			c.StopWithError(iris.StatusNotFound, fmt.Errorf("no translation found for %q language", language))
			return
		}
		result = tx.Edges.Translations[0].Result
		filename = language + "_" + filename
	}

	mlc := c.URLParamIntDefault("mlc", 40)
	mtg := c.URLParamInt64Default("mtg", 900)
	msd := c.URLParamInt64Default("msd", -15)
	colorizeSpeakers := c.URLParamDefault("colorize", "on") == "on"
	format := strings.ToLower(c.URLParamDefault("format", "vtt"))

	subsConfig := subs.SubtitleConfig{
		MaxLengthChars:   mlc,
		ColorizeSpeakers: colorizeSpeakers,
		SpeakerColors:    map[string]string{},
		MaxTimeGap:       mtg,
		MsDelay:          msd,
	}

	fn := strings.Split(filename, "-")[1] + "." + format
	if language != "" {
		fn = language + "_" + fn
	}
	c.Header("Content-Disposition", "attachment; filename="+fn)
	c.Header("HX-Redirect", c.Request().RequestURI)

	var subtitles string
	c.ContentType("text/plain")
	switch format {
	case "vtt":
		subtitles = subs.GenerateSubsVTT(result, subsConfig)
		c.ContentType("text/vtt")
	case "ass":
		subtitles = subs.GenerateSubsASS(result, subsConfig)
		c.ContentType("text/ass")
	case "json":
		c.ContentType("application/json")
		c.JSON(tx)
		return
	}

	_, _ = c.Write([]byte(subtitles))
}
