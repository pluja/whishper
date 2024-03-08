package server

import (
	"context"
	"errors"

	"github.com/kataras/iris/v12"
	"github.com/pluja/anysub/db"
)

// Given a Result as body, it will update the transcription result.
func (s *Server) deleteTranscriptionByID(c iris.Context) {
	id, err := c.Params().GetInt("id")
	if err != nil {
		c.StopWithError(iris.StatusInternalServerError, errors.New("invalid user id"))
		return
	}

	err = db.Client().Transcription.
		DeleteOneID(id).
		Exec(context.Background())
	if err != nil {
		c.StopWithError(iris.StatusInternalServerError, err)
		return
	}

	c.JSON(iris.Map{"ID": id, "detail": "deleted"})
}
