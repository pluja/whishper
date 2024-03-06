// Code generated by ent, DO NOT EDIT.

package ent

import (
	"context"
	"errors"
	"fmt"

	"entgo.io/ent/dialect/sql/sqlgraph"
	"entgo.io/ent/schema/field"
	"github.com/pluja/anysub/ent/translation"
	"github.com/pluja/anysub/models"
)

// TranslationCreate is the builder for creating a Translation entity.
type TranslationCreate struct {
	config
	mutation *TranslationMutation
	hooks    []Hook
}

// SetSourceLanguage sets the "sourceLanguage" field.
func (tc *TranslationCreate) SetSourceLanguage(s string) *TranslationCreate {
	tc.mutation.SetSourceLanguage(s)
	return tc
}

// SetTargetLanguage sets the "targetLanguage" field.
func (tc *TranslationCreate) SetTargetLanguage(s string) *TranslationCreate {
	tc.mutation.SetTargetLanguage(s)
	return tc
}

// SetStatus sets the "status" field.
func (tc *TranslationCreate) SetStatus(i int) *TranslationCreate {
	tc.mutation.SetStatus(i)
	return tc
}

// SetResult sets the "result" field.
func (tc *TranslationCreate) SetResult(mr models.TranscriptionResult) *TranslationCreate {
	tc.mutation.SetResult(mr)
	return tc
}

// Mutation returns the TranslationMutation object of the builder.
func (tc *TranslationCreate) Mutation() *TranslationMutation {
	return tc.mutation
}

// Save creates the Translation in the database.
func (tc *TranslationCreate) Save(ctx context.Context) (*Translation, error) {
	return withHooks(ctx, tc.sqlSave, tc.mutation, tc.hooks)
}

// SaveX calls Save and panics if Save returns an error.
func (tc *TranslationCreate) SaveX(ctx context.Context) *Translation {
	v, err := tc.Save(ctx)
	if err != nil {
		panic(err)
	}
	return v
}

// Exec executes the query.
func (tc *TranslationCreate) Exec(ctx context.Context) error {
	_, err := tc.Save(ctx)
	return err
}

// ExecX is like Exec, but panics if an error occurs.
func (tc *TranslationCreate) ExecX(ctx context.Context) {
	if err := tc.Exec(ctx); err != nil {
		panic(err)
	}
}

// check runs all checks and user-defined validators on the builder.
func (tc *TranslationCreate) check() error {
	if _, ok := tc.mutation.SourceLanguage(); !ok {
		return &ValidationError{Name: "sourceLanguage", err: errors.New(`ent: missing required field "Translation.sourceLanguage"`)}
	}
	if _, ok := tc.mutation.TargetLanguage(); !ok {
		return &ValidationError{Name: "targetLanguage", err: errors.New(`ent: missing required field "Translation.targetLanguage"`)}
	}
	if _, ok := tc.mutation.Status(); !ok {
		return &ValidationError{Name: "status", err: errors.New(`ent: missing required field "Translation.status"`)}
	}
	if _, ok := tc.mutation.Result(); !ok {
		return &ValidationError{Name: "result", err: errors.New(`ent: missing required field "Translation.result"`)}
	}
	return nil
}

func (tc *TranslationCreate) sqlSave(ctx context.Context) (*Translation, error) {
	if err := tc.check(); err != nil {
		return nil, err
	}
	_node, _spec := tc.createSpec()
	if err := sqlgraph.CreateNode(ctx, tc.driver, _spec); err != nil {
		if sqlgraph.IsConstraintError(err) {
			err = &ConstraintError{msg: err.Error(), wrap: err}
		}
		return nil, err
	}
	id := _spec.ID.Value.(int64)
	_node.ID = int(id)
	tc.mutation.id = &_node.ID
	tc.mutation.done = true
	return _node, nil
}

func (tc *TranslationCreate) createSpec() (*Translation, *sqlgraph.CreateSpec) {
	var (
		_node = &Translation{config: tc.config}
		_spec = sqlgraph.NewCreateSpec(translation.Table, sqlgraph.NewFieldSpec(translation.FieldID, field.TypeInt))
	)
	if value, ok := tc.mutation.SourceLanguage(); ok {
		_spec.SetField(translation.FieldSourceLanguage, field.TypeString, value)
		_node.SourceLanguage = value
	}
	if value, ok := tc.mutation.TargetLanguage(); ok {
		_spec.SetField(translation.FieldTargetLanguage, field.TypeString, value)
		_node.TargetLanguage = value
	}
	if value, ok := tc.mutation.Status(); ok {
		_spec.SetField(translation.FieldStatus, field.TypeInt, value)
		_node.Status = value
	}
	if value, ok := tc.mutation.Result(); ok {
		_spec.SetField(translation.FieldResult, field.TypeJSON, value)
		_node.Result = value
	}
	return _node, _spec
}

// TranslationCreateBulk is the builder for creating many Translation entities in bulk.
type TranslationCreateBulk struct {
	config
	err      error
	builders []*TranslationCreate
}

// Save creates the Translation entities in the database.
func (tcb *TranslationCreateBulk) Save(ctx context.Context) ([]*Translation, error) {
	if tcb.err != nil {
		return nil, tcb.err
	}
	specs := make([]*sqlgraph.CreateSpec, len(tcb.builders))
	nodes := make([]*Translation, len(tcb.builders))
	mutators := make([]Mutator, len(tcb.builders))
	for i := range tcb.builders {
		func(i int, root context.Context) {
			builder := tcb.builders[i]
			var mut Mutator = MutateFunc(func(ctx context.Context, m Mutation) (Value, error) {
				mutation, ok := m.(*TranslationMutation)
				if !ok {
					return nil, fmt.Errorf("unexpected mutation type %T", m)
				}
				if err := builder.check(); err != nil {
					return nil, err
				}
				builder.mutation = mutation
				var err error
				nodes[i], specs[i] = builder.createSpec()
				if i < len(mutators)-1 {
					_, err = mutators[i+1].Mutate(root, tcb.builders[i+1].mutation)
				} else {
					spec := &sqlgraph.BatchCreateSpec{Nodes: specs}
					// Invoke the actual operation on the latest mutation in the chain.
					if err = sqlgraph.BatchCreate(ctx, tcb.driver, spec); err != nil {
						if sqlgraph.IsConstraintError(err) {
							err = &ConstraintError{msg: err.Error(), wrap: err}
						}
					}
				}
				if err != nil {
					return nil, err
				}
				mutation.id = &nodes[i].ID
				if specs[i].ID.Value != nil {
					id := specs[i].ID.Value.(int64)
					nodes[i].ID = int(id)
				}
				mutation.done = true
				return nodes[i], nil
			})
			for i := len(builder.hooks) - 1; i >= 0; i-- {
				mut = builder.hooks[i](mut)
			}
			mutators[i] = mut
		}(i, ctx)
	}
	if len(mutators) > 0 {
		if _, err := mutators[0].Mutate(ctx, tcb.builders[0].mutation); err != nil {
			return nil, err
		}
	}
	return nodes, nil
}

// SaveX is like Save, but panics if an error occurs.
func (tcb *TranslationCreateBulk) SaveX(ctx context.Context) []*Translation {
	v, err := tcb.Save(ctx)
	if err != nil {
		panic(err)
	}
	return v
}

// Exec executes the query.
func (tcb *TranslationCreateBulk) Exec(ctx context.Context) error {
	_, err := tcb.Save(ctx)
	return err
}

// ExecX is like Exec, but panics if an error occurs.
func (tcb *TranslationCreateBulk) ExecX(ctx context.Context) {
	if err := tcb.Exec(ctx); err != nil {
		panic(err)
	}
}
