package server

import (
	"context"
	"errors"

	"github.com/kataras/iris/v12"
	"github.com/pluja/anysub/db"
	"github.com/rs/zerolog/log"
)

// Given a Result as body, it will update the transcription result.
func (s *Server) deleteTranscriptionByID(c iris.Context) {
	id, err := c.Params().GetInt("id")
	if err != nil {
		log.Err(err).Msg("error")
		c.StopWithError(iris.StatusInternalServerError, errors.New("invalid tx id"))
		return
	}

	err = db.Client().Transcription.
		DeleteOneID(id).
		Exec(context.Background())
	if err != nil {
		log.Err(err).Msg("error")
		c.StopWithError(iris.StatusInternalServerError, err)
		return
	}

	c.StatusCode(iris.StatusOK)
}
