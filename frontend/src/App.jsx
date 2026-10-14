import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import IconSprite from './components/IconSprite'
import { ThemeProvider } from './hooks/useTheme'
import StyleGuide from './pages/StyleGuide'

export default function App() {
  return (
    <ThemeProvider>
      <IconSprite />
      <BrowserRouter>
        <Routes>
          <Route path="/styleguide" element={<StyleGuide />} />
          <Route path="*" element={<Navigate to="/styleguide" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}
