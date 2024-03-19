package server

import (
	"errors"

	"github.com/kataras/iris/v12"
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
	if err := c.View("partials/modal-new-tl", iris.Map{"ID": id}); err != nil {
		c.HTML("<h3>%s</h3>", err.Error())
	}
}
