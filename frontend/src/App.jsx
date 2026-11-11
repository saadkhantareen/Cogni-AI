import { createBrowserRouter, Navigate, Outlet, RouterProvider } from 'react-router-dom'
import IconSprite from './components/IconSprite'
import { ThemeProvider } from './hooks/useTheme'
import { AuthProvider } from './auth/AuthContext'
import AuthRedirector from './auth/AuthRedirector'
import { ModalProvider } from './components/Modal'
import { ToastProvider } from './components/Toast'
import RoleRoute from './auth/RoleRoute'
import Landing from './pages/public/Landing'
import Login from './pages/public/Login'
import Setup from './pages/public/Setup'
import Register from './pages/public/Register'
import VerifyEmail from './pages/public/VerifyEmail'
import Forgot from './pages/public/Forgot'
import Reset from './pages/public/Reset'
import ChangePassword from './pages/public/ChangePassword'
import AdminApp from './pages/admin/AdminApp'
import TeacherApp from './pages/teacher/TeacherApp'
import HodApp from './pages/hod/HodApp'
import StudentApp from './pages/student/StudentApp'
import NotFound from './pages/NotFound'

function AppRoutes() {
  return (
    <ModalProvider>
      <AuthRedirector>
        <Outlet />
      </AuthRedirector>
    </ModalProvider>
  )
}

const router = createBrowserRouter([
  {
    element: <AppRoutes />,
    children: [
      { path: '/', element: <Landing /> },
      { path: '/setup', element: <Setup /> },
      { path: '/login', element: <Login /> },
      { path: '/register', element: <Register /> },
      { path: '/verify/:token', element: <VerifyEmail /> },
      { path: '/forgot', element: <Forgot /> },
      { path: '/reset/:token', element: <Reset /> },
      { path: '/change-password', element: <ChangePassword /> },
      {
        path: '/app/admin/*',
        element: (
          <RoleRoute roles={['admin']}>
            <AdminApp />
          </RoleRoute>
        ),
      },
      {
        path: '/app/hod/*',
        element: (
          <RoleRoute roles={['hod']}>
            <HodApp />
          </RoleRoute>
        ),
      },
      {
        path: '/app/teacher/*',
        element: (
          <RoleRoute roles={['teacher']}>
            <TeacherApp />
          </RoleRoute>
        ),
      },
      {
        path: '/app/student/*',
        element: (
          <RoleRoute roles={['student']}>
            <StudentApp />
          </RoleRoute>
        ),
      },
      { path: '/app', element: <Navigate to="/login" replace /> },
      { path: '*', element: <NotFound /> },
    ],
  },
])

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <IconSprite />
          {/* Data router so exam generation can ask before leaving the page. */}
          <RouterProvider router={router} />
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
