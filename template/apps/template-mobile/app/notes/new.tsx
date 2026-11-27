import { NoteForm } from '../../src/note-form.native';
import { Screen } from '../../src/screen.native';
import { SignedIn } from '../../src/signed-in.native';

export default function NewNote() {
  return (
    <SignedIn next="/notes/new">
      <Screen>
        <NoteForm />
      </Screen>
    </SignedIn>
  );
}
