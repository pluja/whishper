package main

import (
	"flag"
	"os"

	"github.com/joho/godotenv"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	"github.com/pluja/anysub/db"
	_ "github.com/pluja/anysub/ent/runtime" // This import is required by ent to register hooks
	"github.com/pluja/anysub/server"
	"github.com/pluja/anysub/tasks"
	"github.com/pluja/anysub/utils"
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

	db.Init()
	defer db.Client().Close()
	if taskServer {
		log.Info().Msg("Started task server mode!")
		tasks.StartTaskServer(wxapiHost)
	} else {
		log.Info().Msg("Starting Anysub server...")
		s := server.NewServer(":1337")
		if err := s.Run(); err != nil {
			log.Fatal().Err(err)
		}
	}
}
