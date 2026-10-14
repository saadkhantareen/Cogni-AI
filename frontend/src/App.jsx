import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import IconSprite from './components/IconSprite'
import { ThemeProvider } from './hooks/useTheme'
import { AuthProvider } from './auth/AuthContext'
import RoleRoute from './auth/RoleRoute'
import Landing from './pages/public/Landing'
import Login from './pages/public/Login'
import RoleHome from './pages/RoleHome'
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
        <IconSprite />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/styleguide" element={<StyleGuide />} />

            <Route path="/app/admin/*" element={<RoleHomeRoute role="admin" />} />
            <Route path="/app/hod/*" element={<RoleHomeRoute role="hod" />} />
            <Route path="/app/teacher/*" element={<RoleHomeRoute role="teacher" />} />
            <Route path="/app/student/*" element={<RoleHomeRoute role="student" />} />

            {/* Exact role homes (no trailing segment) */}
            <Route path="/app/admin" element={<RoleHomeRoute role="admin" />} />
            <Route path="/app/hod" element={<RoleHomeRoute role="hod" />} />
            <Route path="/app/teacher" element={<RoleHomeRoute role="teacher" />} />
            <Route path="/app/student" element={<RoleHomeRoute role="student" />} />

            <Route path="/app" element={<Navigate to="/login" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}
