import { Suspense, lazy } from 'react';
import { MotionConfig } from 'motion/react';
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from 'react-router-dom';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { QuizoraLogo } from '@/components/brand/QuizoraLogo';
import { RouteTitleShell } from '@/components/common/RouteTitleSync';
import { AuthProvider } from '@/context/AuthContext';
import { HomePage } from '@/pages/HomePage';

const LoginPage = lazy(() =>
  import('@/pages/auth/LoginPage').then((m) => ({ default: m.LoginPage })),
);
const RegisterPage = lazy(() =>
  import('@/pages/auth/RegisterPage').then((m) => ({
    default: m.RegisterPage,
  })),
);
const ForgotPasswordPage = lazy(() =>
  import('@/pages/auth/ForgotPasswordPage').then((m) => ({
    default: m.ForgotPasswordPage,
  })),
);
const ResetPasswordPage = lazy(() =>
  import('@/pages/auth/ResetPasswordPage').then((m) => ({
    default: m.ResetPasswordPage,
  })),
);
const JoinGamePage = lazy(() =>
  import('@/pages/game/JoinGamePage').then((m) => ({
    default: m.JoinGamePage,
  })),
);
const HostGamePage = lazy(() =>
  import('@/pages/game/HostGamePage').then((m) => ({
    default: m.HostGamePage,
  })),
);
const PresentGamePage = lazy(() =>
  import('@/pages/game/PresentGamePage').then((m) => ({
    default: m.PresentGamePage,
  })),
);
const PlayerGamePage = lazy(() =>
  import('@/pages/game/PlayerGamePage').then((m) => ({
    default: m.PlayerGamePage,
  })),
);
const DashboardLayout = lazy(() =>
  import('@/layouts/DashboardLayout').then((m) => ({
    default: m.DashboardLayout,
  })),
);
const DashboardOverviewPage = lazy(() =>
  import('@/pages/dashboard/DashboardOverviewPage').then((m) => ({
    default: m.DashboardOverviewPage,
  })),
);
const QuizListPage = lazy(() =>
  import('@/pages/dashboard/QuizListPage').then((m) => ({
    default: m.QuizListPage,
  })),
);
const QuizEditorPage = lazy(() =>
  import('@/pages/dashboard/QuizEditorPage').then((m) => ({
    default: m.QuizEditorPage,
  })),
);
const AiCreateQuizPage = lazy(() =>
  import('@/pages/dashboard/AiCreateQuizPage').then((m) => ({
    default: m.AiCreateQuizPage,
  })),
);
const SharedQuizzesPage = lazy(() =>
  import('@/pages/dashboard/SharedQuizzesPage').then((m) => ({
    default: m.SharedQuizzesPage,
  })),
);
const ExplorePage = lazy(() =>
  import('@/pages/explore/ExplorePage').then((m) => ({
    default: m.ExplorePage,
  })),
);
const ExploreQuizDetailPage = lazy(() =>
  import('@/pages/explore/ExploreQuizDetailPage').then((m) => ({
    default: m.ExploreQuizDetailPage,
  })),
);
const GameHistoryPage = lazy(() =>
  import('@/pages/dashboard/GameHistoryPage').then((m) => ({
    default: m.GameHistoryPage,
  })),
);
const GameSessionAnalyticsPage = lazy(() =>
  import('@/pages/dashboard/GameSessionAnalyticsPage').then((m) => ({
    default: m.GameSessionAnalyticsPage,
  })),
);
const ProfilePage = lazy(() =>
  import('@/pages/dashboard/ProfilePage').then((m) => ({
    default: m.ProfilePage,
  })),
);
const SettingsPlaceholderPage = lazy(() =>
  import('@/pages/dashboard/SettingsPlaceholderPage').then((m) => ({
    default: m.SettingsPlaceholderPage,
  })),
);

function RouteLoadingFallback() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-cream-100 text-navy-900 p-6">
      <QuizoraLogo size="md" />
      <p className="mt-4 text-sm font-medium text-navy-600">Yükleniyor...</p>
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <RouteTitleShell />,
    children: [
      {
        path: '/',
        element: <HomePage />,
      },
      {
        path: '/login',
        element: <LoginPage />,
      },
      {
        path: '/register',
        element: <RegisterPage />,
      },
      {
        path: '/forgot-password',
        element: <ForgotPasswordPage />,
      },
      {
        path: '/reset-password',
        element: <ResetPasswordPage />,
      },
      {
        path: '/join',
        element: <JoinGamePage />,
      },
      {
        path: '/join/:pin',
        element: <JoinGamePage />,
      },
      {
        path: '/explore',
        element: <ExplorePage />,
      },
      {
        path: '/explore/:quizId',
        element: <ExploreQuizDetailPage />,
      },
      {
        path: '/host/:pin',
        element: (
          <ProtectedRoute>
            <HostGamePage />
          </ProtectedRoute>
        ),
      },
      {
        path: '/present/:pin',
        element: <PresentGamePage />,
      },
      {
        path: '/play/:pin',
        element: <PlayerGamePage />,
      },
      {
        path: '/dashboard',
        element: (
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        ),
        children: [
          {
            index: true,
            element: <DashboardOverviewPage />,
          },
          {
            path: 'quizzes',
            element: <QuizListPage />,
          },
          {
            path: 'quizzes/new',
            element: <QuizEditorPage />,
          },
          {
            path: 'ai-create',
            element: <AiCreateQuizPage />,
          },
          {
            path: 'quizzes/:id/edit',
            element: <QuizEditorPage />,
          },
          {
            path: 'shared',
            element: <SharedQuizzesPage />,
          },
          {
            path: 'history',
            element: <GameHistoryPage />,
          },
          {
            path: 'history/:sessionId',
            element: <GameSessionAnalyticsPage />,
          },
          {
            path: 'profile',
            element: <ProfilePage />,
          },
          {
            path: 'settings',
            element: <SettingsPlaceholderPage />,
          },
        ],
      },
      {
        path: '*',
        element: <Navigate to="/" replace />,
      },
    ],
  },
]);

export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <AuthProvider>
        <Suspense fallback={<RouteLoadingFallback />}>
          <RouterProvider router={router} />
        </Suspense>
      </AuthProvider>
    </MotionConfig>
  );
}

export default App;
