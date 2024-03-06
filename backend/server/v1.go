package server

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"

	"github.com/duke-git/lancet/v2/convertor"
	"github.com/google/uuid"
	"github.com/kataras/iris/v12"
	"github.com/pluja/anysub/db"
	"github.com/pluja/anysub/ent"
	"github.com/pluja/anysub/models"
	"github.com/pluja/anysub/utils"
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
