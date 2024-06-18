package server

import (
	"regexp"

	"github.com/kataras/iris/v12"

	"github.com/pluja/anysub/db"
)

// registerUser handles the registration process for new users.
func (s *Server) registerUser(ctx iris.Context) {
	password := ctx.FormValue("password")
	password_confirm := ctx.FormValue("password2")
	email := ctx.FormValue("email")

	// Basic validation checks
	if email == "" || password == "" {
		HandleError(ctx, iris.NewProblem().Key("message", "Email and password fields are required"), iris.StatusBadRequest)
		return
	}

	// Validate email format
	if !isValidEmail(email) {
		HandleError(ctx, iris.NewProblem().Key("message", "Invalid email format"), iris.StatusBadRequest)
		return
	}

	// Basic validation checks
	if password != password_confirm {
		HandleError(ctx, iris.NewProblem().Key("message", "Passwords do not match"), iris.StatusBadRequest)
		return
	}

	// Insert the user into the database
	err := db.Client().User.Create().SetEmail(email).SetPassword(password).Exec(ctx)
	if err != nil {
		HandleError(ctx, err)
		return
	}

	ctx.StatusCode(iris.StatusCreated)
	ctx.Redirect("/login?msg='Account created'")
}

// isValidEmail checks if the provided email is in a valid format.
func isValidEmail(email string) bool {
	emailRegex := `^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$`
	re := regexp.MustCompile(emailRegex)
	return re.MatchString(email)
}
