
const AuthLayout = ({children}: {children: React.ReactNode}) => {
  return (
    <div className="min-h-screen bg-linear-to-br from-neutral-50 to-neutral-100">
        {children}
    </div>
  )
}

export default AuthLayout