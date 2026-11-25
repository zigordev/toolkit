import { SignUpForm } from './sign-up-form.tsx';

export default function SignUp() {
  return (
    <main>
      <h1>Sign up</h1>
      <SignUpForm />
      <p>
        Already have an account? <a href="/sign-in">Sign in</a>
      </p>
    </main>
  );
}
