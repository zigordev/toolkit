# 0054. A signed-in person reaches only the notes they wrote

- Status: accepted
- Date: 2026-11-26
- Supersedes: none

## Context

The template's API has notes since its second slice, and sign-in since its third. Until now only an API key reached the notes: a key carries the scopes `notes:read` and `notes:write`, and a session carries none, so a signed-in person got 403 on every notes route.

Step 6.5 of the build plan adds the notes pages, which a signed-in person uses. The template starts every product, so whatever it does here is what a product copies on its first day.

On 2026-11-26 the owner was asked whose notes a signed-in person should see and change, with three options: their own, one shared set, or a key of the web app's own. They chose, in their words: "Their own (Recommended)".

## Decision

- **Every note has an owner, or none.** The column `notes.owner_id` names the user who wrote the note. A note made with an API key has no owner.
- **A signed-in person reaches only their own notes.** The list holds only them, and any other note answers 404 to a read, a change or a delete, as a note that does not exist does. A person needs no scope.
- **An API key reaches every note**, with the scope that the route names, as before: `notes:read` to read, `notes:write` to change.
- **A note goes with its owner.** The foreign key deletes a person's notes when their account is deleted.
- **The API decides**, not the web app, so a mobile app later gets the same rule.

## Consequences

- A product made from the template starts with data that belongs to people, kept apart in the API and tested there.
- The migration `0004_add_notes_owner` adds a column that may be empty, its foreign key and an index on the owner, the creation time and the id, which serves a person's list in its default order. It deletes nothing, and the notes that exist stay with no owner.
- A person's list never names another person's note, and an id that is not theirs reveals nothing, because it answers like a missing one.
- An API key still reads every person's notes. A product that holds data people consider private decides who gets such a key.
- The note's answer in the API does not name its owner.

## Alternatives considered

- **One shared set.** A session would get both notes scopes. No migration and a few lines, but anyone who signs up could read and delete everyone's notes, and every product would have to redo it.
- **A key of the web app's own.** The web app's server would call the API with an API key. No change to the API, but the API could not tell people apart, the key would be one more production secret, and a mobile app would need another way in.
