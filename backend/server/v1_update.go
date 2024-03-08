package server

import (
	"context"
	"fmt"

	"github.com/kataras/iris/v12"
	"github.com/pluja/anysub/db"
	"github.com/pluja/anysub/ent/transcription"
	"github.com/pluja/anysub/models"
)

// Given a Result as body, it will update the transcription result.
func (s *Server) updateTranscriptionResultByID(c iris.Context) {
	id, err := c.Params().GetInt("id")
	if err != nil {
		c.StopWithError(iris.StatusBadRequest, fmt.Errorf("invalid user id"))
		return
	}

	// Parse JSON body
	var trPatch models.TranscriptionResult
	if err := c.ReadJSON(&trPatch); err != nil {
		c.StopWithError(iris.StatusBadRequest, fmt.Errorf("invalid request body"))
		return
	}

	tx, err := db.Client().Transcription.
		UpdateOneID(id).
		SetResult(trPatch).
		Save(context.Background())
	if err != nil {
		c.StopWithError(iris.StatusInternalServerError, err)
		return
	}

	c.JSON(tx)
}

// Given a Result as body, it will update the transcription's translation for `lang` result.
func (s *Server) updateTranslation(c iris.Context) {
	id, err := c.Params().GetInt("id")
	if err != nil {
		c.StopWithError(iris.StatusBadRequest, fmt.Errorf("invalid user id"))
		return
	}

	language := c.Params().GetString("lang")
	if language == "" {
		c.StopWithError(iris.StatusBadRequest, fmt.Errorf("missing language"))
		return
	}

	// Parse JSON body
	var trPatch models.TranscriptionResult
	if err := c.ReadJSON(&trPatch); err != nil {
		c.StopWithError(iris.StatusBadRequest, fmt.Errorf("invalid request body"))
		return
	}

	tx, err := db.Client().Transcription.Query().
		Where(transcription.ID(id)).
		WithTranslations(). // Include the "Comments" edge
		Only(context.Background())
	if err != nil {
		c.StopWithError(iris.StatusNotFound, err)
		return
	}

	tlID := -1
	for _, tl := range tx.Edges.Translations {
		if tl.TargetLanguage == language {
			tlID = tl.ID
			break
		}
	}

	if tlID == -1 {
		c.StopWithError(iris.StatusNotFound, fmt.Errorf("no translations for this language"))
		return
	}

	tl, err := db.Client().Translation.UpdateOneID(tlID).SetResult(trPatch).Save(context.Background())
	if err != nil {
		c.StopWithError(iris.StatusInternalServerError, err)
		return
	}

	c.JSON(tl)
}
