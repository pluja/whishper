package server

import (
	"github.com/kataras/iris/v12"
	"github.com/rs/zerolog/log"
)

func HandleError(c iris.Context, err error, s ...int) {
	log.Error().Err(err)

	if len(s) == 0 {
		c.StopWithError(iris.StatusInternalServerError, err)
	} else {
		c.StopWithError(s[0], err)
	}
}
