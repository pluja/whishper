package server

import (
	"context"
	"errors"

	"github.com/kataras/iris/v12"
	"github.com/pluja/anysub/db"
	"github.com/pluja/anysub/ent/transcription"
	"github.com/pluja/anysub/utils/translations"
)

func (s *Server) Index(c iris.Context) {
	c.ViewLayout("main")
	if err := c.View("pages/index"); err != nil {
		c.HTML("<h3>%s</h3>", err.Error())
	}
}

func (s *Server) NewTxModal(c iris.Context) {
	if err := c.View("partials/modal-new-tx"); err != nil {
		c.HTML("<h3>%s</h3>", err.Error())
	}
}

func (s *Server) NewTlModal(c iris.Context) {
	id, err := c.Params().GetInt("id")
	if err != nil {
		c.StopWithError(iris.StatusBadRequest, errors.New("invalid id"))
		return
	}

	lang := c.URLParamDefault("lang", "auto")

	languages, _ := translations.AvailableLanguages()

	if err := c.View("partials/modal-new-tl", iris.Map{"ID": id, "Languages": languages, "Lang": lang}); err != nil {
		c.HTML("<h3>%s</h3>", err.Error())
	}
}

func (s *Server) DownloadModal(c iris.Context) {
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

	if err := c.View("partials/modal-download", iris.Map{"ID": id, "Transcription": tx}); err != nil {
		c.HTML("<h3>%s</h3>", err.Error())
	}
}
