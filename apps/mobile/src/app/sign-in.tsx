import {AuthScreen} from '@/components/auth-screen';

export default function SignInScreen() {
  return (
    <AuthScreen
      mode="sign-in"
      title="Welcome back"
      subtitle="Sign in to talk to your AI coworkers."
    />
  );
}
