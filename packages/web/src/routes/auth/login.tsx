import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
	LoginForm,
	type LoginFormValues,
} from "@/features/auth/components/login-form";
import { login } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";

const loginSchema = z.object({
	username: z.string().trim().min(1, "Username is required"),
	password: z.string().trim().min(1, "Password is required"),
});

export const Route = createFileRoute("/auth/login")({
	beforeLoad: () => {
		if (useAuthStore.getState().token) {
			throw redirect({ to: "/" });
		}
	},
	component: LoginPage,
});

function LoginPage() {
	const navigate = useNavigate();
	const setToken = useAuthStore((state) => state.setToken);

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
			setToken(response.token);
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
}
