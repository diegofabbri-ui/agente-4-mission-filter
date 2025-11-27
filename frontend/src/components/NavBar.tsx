// src/components/NavBar.tsx
import { Link, useLocation } from "react-router-dom";
import {
  HomeIcon,
  Cog6ToothIcon,
  PlusCircleIcon,
  SparklesIcon,
  ChartBarIcon,
} from "@heroicons/react/24/outline";

export default function NavBar() {
  const location = useLocation();

  const navItems = [
    { to: "/", label: "Home", icon: HomeIcon },
    { to: "/profile", label: "Profilo", icon: Cog6ToothIcon },
    { to: "/add-mission", label: "Nuova", icon: PlusCircleIcon },
    { to: "/ai", label: "AI", icon: SparklesIcon },
    { to: "/dashboard", label: "Dashboard", icon: ChartBarIcon },
  ];

  return (
    <nav className="w-full border-b border-black/10 bg-white/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <span className="font-semibold tracking-wide text-black/80">
          Agente 4
        </span>

        <div className="flex items-center gap-5">
          {navItems.map((item) => {
            const Icon = item.icon;

            const active = location.pathname === item.to;

            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-1 text-sm transition-all 
                  ${
                    active
                      ? "text-black font-semibold"
                      : "text-gray-500 hover:text-black"
                  }`}
              >
                <Icon className="w-5 h-5" />
                <span className="hidden sm:flex">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}


