package server

import (
	"context"
	"log"

	"github.com/kataras/iris/v12"
	"github.com/kataras/iris/v12/sessions"

	"github.com/pluja/anysub/db"
	"github.com/pluja/anysub/ent/user"
	"github.com/pluja/anysub/utils"
)

func (s *Server) LoginHandler(c iris.Context) {
	// Get the session
	session := sessions.Get(c)

	// Retrieve form values
	email := c.FormValue("email")
	password := c.FormValue("password")

	// Validate form inputs
	if email == "" || password == "" {
		c.StatusCode(iris.StatusBadRequest)
		c.WriteString("Please fill out both email and password fields.")
		return
	}

	// Login logic: check database for user and validate password
	user, err := db.Client().User.Query().Where(user.EmailEQ(email)).First(context.Background())
	if err != nil {
		HandleError(c, err)
		return
	}

	err = utils.VerifyPassword(user.Password, password)
	if err != nil {
		// Wrong password or other error, login fails redirect to login page
		HandleError(c, err)
		return
	}

	log.Println("Password verified successfully.")

	// Set user session
	session.Set("user", user.ID)

	// Redirect the user to the main application
	c.Redirect("/app")
}
