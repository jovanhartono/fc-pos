import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { login } from "@/features/auth/api";
import { LoginForm } from "@/features/auth/components/login-form";
import type { LoginFormValues } from "@/features/auth/components/login-form";
import { useAuthStore } from "@/stores/auth-store";

const loginSchema = z.object({
  username: z.string().trim().min(1, "Username is required"),
  password: z.string().trim().min(1, "Password is required"),
});

const LoginPage = () => {
  const navigate = useNavigate();
  const setUser = useAuthStore((state) => state.setUser);

  useEffect(() => {
    document.title = "Sign In | Fresclean POS";
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const loginMutation = useMutation({
    mutationKey: ["login"],
    mutationFn: login,
    onSuccess: (response) => {
      setUser(response.user);
      void navigate({ to: "/" });
    },
  });

  const onSubmit = async (values: LoginFormValues) => {
    await loginMutation.mutateAsync(values);
  };

  return (
    <LoginForm
      register={register}
      handleSubmit={handleSubmit}
      onSubmit={onSubmit}
      errors={errors}
      isSubmitting={loginMutation.isPending}
    />
  );
};

export const Route = createFileRoute("/auth/login")({
  beforeLoad: () => {
    if (useAuthStore.getState().user) {
      throw redirect({ to: "/" });
    }
  },
  component: LoginPage,
});
