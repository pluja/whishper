package server

import (
	"context"
	"errors"

	"github.com/kataras/iris/v12"

	"github.com/pluja/anysub/db"
	"github.com/pluja/anysub/ent/transcription"
	"github.com/pluja/anysub/frontend/htmx"
	"github.com/pluja/anysub/utils/translations"
)

func (s *Server) NewTranslationModalHandler(c iris.Context) {
	id, err := c.Params().GetInt("id")
	if err != nil {
		c.StopWithError(iris.StatusBadRequest, errors.New("invalid id"))
		return
	}

	lang := c.URLParamDefault("lang", "auto")

	languages, _ := translations.AvailableLanguages()

	if err := c.RenderComponent(htmx.ModalNewTranslation(languages, id, lang)); err != nil {
		c.HTML("<h3>%s</h3>", err.Error())
	}
}

func (s *Server) DownloadModalHandler(c iris.Context) {
	id, err := c.Params().GetInt("id")
	if err != nil {
		c.StopWithError(iris.StatusBadRequest, errors.New("invalid id"))
		return
	}

	tx, err := db.Client().Transcription.Query().
		Where(transcription.ID(id)).
		WithTranslations().
		Only(context.Background())
	if err != nil {
		c.StopWithError(iris.StatusBadRequest, err)
		return
	}

	if err := c.RenderComponent(htmx.ModalDownload(tx)); err != nil {
		c.HTML("<h3>%s</h3>", err.Error())
	}
}
