// client.go
package db

import (
	"context"
	"log"

	"entgo.io/ent/dialect"
	_ "github.com/go-sql-driver/mysql"

	"github.com/pluja/anysub/ent"
	"github.com/pluja/anysub/utils"
)

var client *ent.Client

// Init initializes the database client.
func Init() {
	var err error
	//client, err = ent.Open(dialect.SQLite, "file:ent?mode=memory&cache=shared&_fk=1")
	// client, err = ent.Open(dialect.SQLite, "file:./db.sql?cache=shared&_fk=1")
	client, err = ent.Open(dialect.MySQL, utils.Getenv("DATABASE_URI", "anysub:anysub@tcp(database:3306)/anysub?parseTime=True"))
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
