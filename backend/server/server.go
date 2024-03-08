package server

import (
	"net/http"

	"github.com/kataras/iris/v12"
)

type Server struct {
	ListenAddr string
	Router     *iris.Application
	HttpClient *http.Client
	//db         *ent.Client
}

func NewServer(listenAddr string) *Server {
	app := iris.New()

	return &Server{
		ListenAddr: listenAddr,
		Router:     app,
		HttpClient: &http.Client{},
		//db:         db.Client(),
	}
}

func (s *Server) Run() error {
	s.SetupMiddleware()
	s.RegisterRoutes()
	return s.Router.Listen(s.ListenAddr)
}

func (s *Server) SetupMiddleware() {
	s.Router.Use(iris.Compression)
	s.Router.Logger().SetLevel("warn")
	s.Router.Use(iris.Cache304(24 * 60 * 60))
}

func (s *Server) RegisterRoutes() {
	v1Api := s.Router.Party("/api/v1")
	{
		//limitV1 := rate.Limit(rate.Every(1*time.Minute), 5, rate.PurgeEvery(time.Minute, 5*time.Minute))
		//v1Api.Use(limitV1)

		// Transcribe API
		v1Api.Post("/transcriptions", s.createTranscription)
		v1Api.Get("/transcriptions", s.listTranscriptions)
		v1Api.Get("/transcriptions/{id:int}", s.getTranscriptionByID)
		v1Api.Patch("/transcriptions/{id:int}", s.updateTranscriptionResultByID)
		v1Api.Delete("/transcriptions/{id:int}", s.deleteTranscriptionByID)
		v1Api.Get("/transcriptions/{id:int}/status", s.getTranscriptionStatusByID)
		v1Api.Get("/transcriptions/{id:int}/subtitles", s.getTranscriptionSubtitles)

		// Translate API
		v1Api.Post("/transcriptions/{id:int}/translations/{langTo:string}", s.createTranslationTask)
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
