import { Link, useNavigate, useLocation } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS } from "@/lib/wagon-roles";
import { LogOut, Train, Users } from "lucide-react";

export function AppHeader() {
  const { user, roles, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = roles.includes("ADMIN");

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/auth" });
  };

  return (
    <header className="sticky top-0 z-30 border-b bg-card/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-4 px-4">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Train className="h-4 w-4" />
          </div>
          <span className="hidden sm:inline">Вагонооборот</span>
        </Link>

        <nav className="flex items-center gap-1">
          <Link to="/">
            <Button
              variant={location.pathname === "/" ? "secondary" : "ghost"}
              size="sm"
            >
              Журнал
            </Button>
          </Link>
          {isAdmin && (
            <Link to="/admin">
              <Button
                variant={location.pathname === "/admin" ? "secondary" : "ghost"}
                size="sm"
              >
                <Users className="mr-1 h-4 w-4" /> Пользователи
              </Button>
            </Link>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden flex-wrap justify-end gap-1 sm:flex">
            {roles.length === 0 ? (
              <Badge variant="outline">Без роли</Badge>
            ) : (
              roles.map((r) => (
                <Badge key={r} variant="secondary">
                  {ROLE_LABELS[r]}
                </Badge>
              ))
            )}
          </div>
          <span className="hidden text-sm text-muted-foreground md:inline">
            {user?.email}
          </span>
          <Button variant="ghost" size="icon" onClick={handleSignOut} title="Выйти">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
