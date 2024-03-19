package db

import (
	"context"
	"log"

	"entgo.io/ent/dialect"
	_ "github.com/mattn/go-sqlite3"
	"github.com/pluja/anysub/ent"
)

var client *ent.Client

func init() {
	var err error
	//client, err = ent.Open(dialect.SQLite, "file:ent?mode=memory&cache=shared&_fk=1")
	client, err = ent.Open(dialect.SQLite, "file:./db.sql?cache=shared&_fk=1")
	if err != nil {
		log.Fatalf("failed opening connection to sqlite: %v", err)
	}

	// Run the auto migration tool.
	if err := client.Schema.Create(context.Background()); err != nil {
		log.Fatalf("failed creating schema resources: %v", err)
	}
}

func Client() *ent.Client {
	return client
}
