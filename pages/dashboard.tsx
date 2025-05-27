import React from 'react'
import Dashboard from '../ui/components/Dashboard'

const DashboardPage = ({ onboardingRequired }: { onboardingRequired: boolean }) => {
  return (
    <>
      <Dashboard onboardingRequired={onboardingRequired} />
    </>
  )
}

export default DashboardPage