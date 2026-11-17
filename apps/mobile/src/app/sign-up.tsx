import {AuthScreen} from '@/components/auth-screen';

export default function SignUpScreen() {
  return (
    <AuthScreen
      mode="sign-up"
      title="Create your account"
      subtitle="Binary runs on your machine. Your account stays there too."
    />
  );
}
