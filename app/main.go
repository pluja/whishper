package main

import (
	"flag"
	"os"

	"github.com/joho/godotenv"
	"github.com/pluja/anysub/db"
	"github.com/pluja/anysub/server"
	"github.com/pluja/anysub/tasks"
	"github.com/pluja/anysub/utils"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

var (
	dev        bool
	taskServer bool
	wxapiHost  string
)

func init() {
	flag.BoolVar(&dev, "dev", false, "start in dev mode.")
	flag.BoolVar(&taskServer, "task-server", false, "start in task-server mode.")
	flag.StringVar(&wxapiHost, "wx-api-host", utils.Getenv("AS_WX_API_HOST", ""), "if task server mode, define a whisper endpoint.")
	flag.Parse()
	godotenv.Load()

	// Configure dev mode
	if dev {
		log.Logger = log.Output(
			zerolog.ConsoleWriter{
				Out:        os.Stdout,
				TimeFormat: "15:04:05",
			},
		).With().Caller().Logger()
		zerolog.SetGlobalLevel(zerolog.DebugLevel)
	}
}

func main() {
	log.Info().Msg("Initializing server.")
	//_ = db.Client()
	//go worker.Start()
	db.Init()
	if taskServer {
		log.Info().Msg("Started task server mode!")
		tasks.StartTaskServer(wxapiHost)
	} else {
		//go tasks.StartTaskServer(wxapiHost)
		s := server.NewServer(":1337")
		if err := s.Run(); err != nil {
			log.Fatal().Err(err)
		}
	}
}
