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
	"github.com/kataras/iris/v12"
)

type Server struct {
	ListenAddr string
	Router     *iris.Application
	HttpClient *http.Client
}

func NewServer(listenAddr string) *Server {
	app := iris.New()

	return &Server{
		ListenAddr: listenAddr,
		Router:     app,
		HttpClient: &http.Client{},
	}
}

func (s *Server) SetupMiddleware() {
	s.Router.Use(iris.Compression)
	s.Router.Logger().SetLevel("warn")
	s.Router.Use(iris.Cache304(24 * 60 * 60))
}

func (s *Server) RegisterRoutes() {
	// Static routes
	s.Router.Favicon(path.Join(os.Getenv("ROOT_DIR"), "/frontend/static", "/assets/favicon.webp"))
	s.Router.HandleDir("/static", iris.Dir(path.Join(os.Getenv("ROOT_DIR"), "/frontend/static")))

	// UI Routes
	{
		s.Router.Get("/", s.Index)
	}

	// HTML Elements routes
	{
		htmlv1 := s.Router.Party("/html/v1")
		htmlv1.Get("/modal-new-tx", s.NewTxModal)
		htmlv1.Get("/modal-new-tl/{id:int}", s.NewTlModal)
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
		// v1Api.Get("/service/{name:string}/summary", s.handleScoreSummary)
	}
}

func (s *Server) Run() error {
	s.SetupMiddleware()
	s.RegisterRoutes()
	s.RegisterViews()
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
