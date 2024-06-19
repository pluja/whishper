package server

import (
	"net/http"
	"path"
	"time"

	"github.com/hibiken/asynq"
	"github.com/kataras/iris/v12"
	"github.com/kataras/iris/v12/sessions"

	"github.com/pluja/anysub/frontend"
	"github.com/pluja/anysub/frontend/htmx"
	"github.com/pluja/anysub/utils"
)

type Server struct {
	ListenAddr string
	Router     *iris.Application
	HttpClient *http.Client
	TaskClient *asynq.Client
}

func NewServer(listenAddr string) *Server {
	app := iris.New()

	return &Server{
		ListenAddr: listenAddr,
		Router:     app,
		HttpClient: &http.Client{},
		TaskClient: asynq.NewClient(asynq.RedisClientOpt{Addr: "127.0.0.1:6379"}),
	}
}

func (s *Server) SetupMiddleware() {
	s.Router.Use(iris.Compression)
	s.Router.Logger().SetLevel("warn")
	s.Router.Use(iris.Cache304(24 * 60 * 60))

	sess := sessions.New(
		sessions.Config{
			Cookie:                      "_sess",
			Expires:                     time.Hour * 72,
			DisableSubdomainPersistence: false,
			AllowReclaim:                true,
		},
	)

	s.Router.Use(sess.Handler())
}

func (s *Server) RegisterRoutes() {
	// Static routes
	rdir := utils.Getenv("ROOT_DIR", "./")
	s.Router.Favicon(path.Join(rdir, "/frontend/static", "/assets/favicon.webp"))
	s.Router.HandleDir("/static", iris.Dir(path.Join(rdir, "/frontend/static")))

	// Root Routes
	{
		// Redirect root requests to the login page
		s.Router.Get("/", func(ctx iris.Context) {
			ctx.Redirect("/login")
		})

		// Authentication handlers for login and registration actions
		s.Router.Post("/login", s.LoginHandler)
		s.Router.Post("/register", s.registerUser)

		// Create a party for routes requiring authentication
		authParty := s.Router.Party("/")
		authParty.Use(s.AuthRedirects)

		// Auth pages (only accessible when not authenticated)
		authParty.Get("/login", iris.Component(frontend.Login()))
		authParty.Get("/register", iris.Component(frontend.Register()))

		// Create a sub-party for routes requiring user authentication
		{
			// Protected route for the main app
			appParty := authParty.Party("/app")
			appParty.Get("/", iris.Component(frontend.Index()))
		}
	}

	// HTMX Elements routes
	{
		v1Htmx := s.Router.Party("/htmx/v1")
		v1Htmx.Use(s.ApiMustBeLogged)
		v1Htmx.Get("/modal-new-tx", iris.Component(htmx.ModalNewTranscription()))
		v1Htmx.Get("/modal-new-tl/{id:int}", s.NewTranslationModalHandler)
		v1Htmx.Get("/modal-download/{id:int}", s.DownloadModalHandler)
	}

	// API v1 Routes
	{
		v1Api := s.Router.Party("/api/v1")
		v1Api.Use(s.ApiMustBeLogged)

		// Transcribe API
		v1Api.Post("/transcriptions", s.createTranscription)
		v1Api.Get("/transcriptions", s.listTranscriptions)
		v1Api.Get("/transcriptions/{id:int}", s.getTranscriptionByID)
		v1Api.Patch("/transcriptions/{id:int}", s.updateTranscriptionResultByID)
		v1Api.Delete("/transcriptions/{id:int}", s.deleteTranscriptionByID)
		v1Api.Get("/transcriptions/{id:int}/status", s.getTranscriptionStatusByID)
		v1Api.Get("/transcriptions/{id:int}/subtitles", s.getTranscriptionSubtitles)

		// Translate API
		v1Api.Post("/transcriptions/{id:int}/translations", s.createTranslationTask)
		v1Api.Patch("/transcriptions/{id:int}/translations/{langTo:string}", s.updateTranslation)
		// v1Api.Get("/transcriptions/{id:int}/translations/{lang:str}", s.getTranslationByLanguage)
		// v1Api.Get("/transcriptions/{id:int}/translations/{lang:str}/status", s.getTranslationStatusByLanguage)

		// Sumarize API
		// v1Api.Post("/transcription/{id:int}/summary", s.newTranscription)
		// v1Api.Get("/transcription/{id:int}/summary", s.getTranscriptions)

		// Info APIS
		// v1Api.Get("/translation/languages", s.getTranscriptions)
	}
}

func (s *Server) AuthRedirects(c iris.Context) {
	session := sessions.Get(c)
	path := c.Path()
	isLoggedIn := session.Len() > 0
	registrationsDisabled := utils.Getenv("REGISTRATIONS", "true") == "false"

	switch {
	case registrationsDisabled && path == "/register":
		c.Redirect("/login")
	case !isLoggedIn && path != "/login" && path != "/register":
		c.Redirect("/login")
	case isLoggedIn && (path == "/login" || path == "/" || path == "/register"):
		c.Redirect("/app")
	default:
		c.Next()
	}
}

func (s *Server) ApiMustBeLogged(c iris.Context) {
	session := sessions.Get(c)
	if session.Len() == 0 {
		c.StatusCode(iris.StatusForbidden)
		c.JSON(iris.Map{"error": "User must be logged in."})
		return
	}
	c.Next()
}

func (s *Server) Run() error {
	s.SetupMiddleware()
	s.RegisterRoutes()
	return s.Router.Listen(s.ListenAddr)
}
