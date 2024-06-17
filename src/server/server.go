package server

import (
	"errors"
	"fmt"
	"html/template"
	"net/http"
	"os"
	"path"
	"strings"
	"time"

	"github.com/dustin/go-humanize"
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
		authr := s.Router.Party("/")
		authr.Use(s.AuthRedirects)

		// Auth pages (only accessible when not authenticated)
		authr.Get("/login", iris.Component(frontend.Login()))
		authr.Get("/register", iris.Component(frontend.Register()))

		// Create a sub-party for routes requiring user authentication
		{
			app := authr.Party("/app")

			// Protected route rendering the application index page
			app.Get("/", iris.Component(frontend.Index()))
		}
	}

	// HTMX Elements routes
	{
		v1Htmx := s.Router.Party("/htmx/v1")
		v1Htmx.Get("/modal-new-tx", iris.Component(htmx.ModalNewTranscription()))
		v1Htmx.Get("/modal-new-tl/{id:int}", s.NewTranslationModalHandler)
		v1Htmx.Get("/modal-download/{id:int}", s.DownloadModalHandler)
	}

	// API v1 Routes
	{
		v1Api := s.Router.Party("/api/v1")

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

	if session.Len() == 0 {
		// If user is not logged in and they are not at '/login' or '/register', redirect to '/login'.
		// This includes the root path '/'
		if path != "/login" && path != "/register" {
			c.Redirect("/login")
			return
		}
	} else {
		// If user is logged in and they are trying to access '/login' or '/register', redirect to '/app'.
		if path == "/login" || path == "/" || path == "/register" {
			c.Redirect("/app")
			return
		}
	}

	// Continue to the next handler if no redirect is performed.
	c.Next()
}

func (s *Server) Run() error {
	s.SetupMiddleware()
	s.RegisterRoutes()
	//s.RegisterViews()
	return s.Router.Listen(s.ListenAddr)
}

func (s *Server) RegisterViews() {
	// Use blocks as the templating engine
	blocks := iris.Blocks("./frontend/templates", ".html")

	blocks.Engine.Funcs(template.FuncMap{
		"safe": func(s string) template.HTML {
			return template.HTML(s)
		},
		"ellipsisString": func(addr string) string {
			return fmt.Sprintf("%s...%s", addr[:6], addr[len(addr)-6:])
		},
		"humanizeTime": func(t time.Time) string {
			return humanize.Time(t)
		},
		"makeTitle": func(t string) string {
			title := strings.Split(t, "-")[1]
			if len(title) > 60 {
				return title[:60] + "..."
			}
			return title
		},
		"dateString": func(t string) string {
			if t == "" {
				return "Unknown"
			}

			layout := "2006-01-02 15:04:05.000Z"

			tm, err := time.Parse(layout, t)
			if err != nil {
				return t
			}
			return tm.Format("2006-01-02")
		},
		"isNew": func(t string) bool {
			if t == "" {
				return false
			}

			layout := "2006-01-02 15:04:05.000Z"

			tm, err := time.Parse(layout, t)
			if err != nil {
				return false
			}
			return time.Since(tm) < 7*(24*time.Hour)
		},
		"shortString": func(s string) string {
			return s[:8]
		},
		"dict": func(values ...interface{}) (map[string]interface{}, error) {
			if len(values)%2 != 0 {
				return nil, errors.New("invalid dict call")
			}
			dict := make(map[string]interface{}, len(values)/2)
			for i := 0; i < len(values); i += 2 {
				key, ok := values[i].(string)
				if !ok {
					return nil, errors.New("dict keys must be strings")
				}
				dict[key] = values[i+1]
			}
			return dict, nil
		},
	})
	if os.Getenv("DEV") == "true" {
		blocks.Reload(true)
	}
	s.Router.RegisterView(blocks)
}
