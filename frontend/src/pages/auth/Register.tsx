// frontend/src/pages/auth/Register.tsx
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { useAuth } from "../../state/AuthContext";

type RegisterFormValues = {
  fullName: string;
  email: string;
  password: string;
};

export default function Register() {
  const { register: registerUser } = useAuth();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<RegisterFormValues>({
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
    },
  });

  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (values: RegisterFormValues) => {
    setError(null);
    try {
      await registerUser({
        email: values.email,
        password: values.password,
        fullName: values.fullName,
      });
      navigate("/dashboard", { replace: true });
    } catch (err: any) {
      if (err?.response?.status === 409) {
        setError("Questa email è già registrata.");
      } else {
        setError("Errore durante la registrazione.");
      }
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="w-full max-w-md bg-gray-900 border border-gray-700 rounded-2xl p-6 shadow-xl text-white">
        <h1 className="text-2xl font-bold mb-2">Crea il tuo profilo</h1>
        <p className="text-sm text-gray-400 mb-6">
          In pochi passaggi hai un agente AI che filtra le missioni per te.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Nome completo */}
          <div>
            <label className="block text-sm mb-1">Nome completo</label>
            <input
              type="text"
              {...register("fullName", { required: true })}
              className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm"
              placeholder="Diego Fabbri"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm mb-1">Email</label>
            <input
              type="email"
              {...register("email", { required: true })}
              className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm"
              placeholder="tu@esempio.com"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm mb-1">Password</label>
            <input
              type="password"
              {...register("password", { required: true, minLength: 8 })}
              className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm"
              placeholder="Minimo 8 caratteri"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-900/30 px-3 py-2 rounded-md">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 transition-colors rounded-md py-2 text-sm font-semibold"
          >
            {isSubmitting ? "Creazione account…" : "Registrati"}
          </button>
        </form>

        <p className="mt-4 text-sm text-gray-400">
          Hai già un account?{" "}
          <Link
            to="/auth/login"
            className="text-blue-400 hover:text-blue-300 underline"
          >
            Accedi
          </Link>
        </p>
      </div>
    </div>
  );
}
