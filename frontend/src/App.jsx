import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import IconSprite from './components/IconSprite'
import { ThemeProvider } from './hooks/useTheme'
import { AuthProvider } from './auth/AuthContext'
import { ModalProvider } from './components/Modal'
import { ToastProvider } from './components/Toast'
import RoleRoute from './auth/RoleRoute'
import Landing from './pages/public/Landing'
import Login from './pages/public/Login'
import RoleHome from './pages/RoleHome'
import TeacherApp from './pages/teacher/TeacherApp'
import HodApp from './pages/hod/HodApp'
import NotFound from './pages/NotFound'
import StyleGuide from './pages/StyleGuide'

function RoleHomeRoute({ role }) {
  return (
    <RoleRoute roles={[role]}>
      <RoleHome />
    </RoleRoute>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <ModalProvider>
            <IconSprite />
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/login" element={<Login />} />
                <Route path="/styleguide" element={<StyleGuide />} />

                <Route path="/app/admin/*" element={<RoleHomeRoute role="admin" />} />
                <Route
                  path="/app/hod/*"
                  element={
                    <RoleRoute roles={['hod']}>
                      <HodApp />
                    </RoleRoute>
                  }
                />
                <Route
                  path="/app/teacher/*"
                  element={
                    <RoleRoute roles={['teacher']}>
                      <TeacherApp />
                    </RoleRoute>
                  }
                />
                <Route path="/app/student/*" element={<RoleHomeRoute role="student" />} />

                <Route path="/app/admin" element={<RoleHomeRoute role="admin" />} />
                <Route path="/app/student" element={<RoleHomeRoute role="student" />} />

                <Route path="/app" element={<Navigate to="/login" replace />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </ModalProvider>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
