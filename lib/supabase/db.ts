import { createClient } from './server'

export async function getJobs(userId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('DB error (getJobs):', error)
    return []
  }
  return data || []
}

export async function getJobById(jobId: string | number, userId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .eq('user_id', userId)
    .single()

  if (error) {
    console.error('DB error (getJobById):', error)
    return null
  }
  return data
}

export async function deleteJob(jobId: string | number, userId: string) {
  const supabase = createClient()
  const { error } = await supabase
    .from('jobs')
    .delete()
    .eq('id', jobId)
    .eq('user_id', userId)

  if (error) {
    console.error('DB error (deleteJob):', error)
    return false
  }
  return true
}

export async function deleteAllJobs(userId: string) {
  const supabase = createClient()
  const { error } = await supabase
    .from('jobs')
    .delete()
    .eq('user_id', userId)

  if (error) {
    console.error('DB error (deleteAllJobs):', error)
    return false
  }
  return true
}

export async function getApplications(userId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('applications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('DB error (getApplications):', error)
    return []
  }
  return data || []
}

export async function deleteApplication(appId: string | number, userId: string) {
  const supabase = createClient()
  const { error } = await supabase
    .from('applications')
    .delete()
    .eq('id', appId)
    .eq('user_id', userId)

  if (error) {
    console.error('DB error (deleteApplication):', error)
    return false
  }
  return true
}

export async function deleteAllApplications(userId: string) {
  const supabase = createClient()
  const { error } = await supabase
    .from('applications')
    .delete()
    .eq('user_id', userId)

  if (error) {
    console.error('DB error (deleteAllApplications):', error)
    return false
  }
  return true
}

export async function getDiscoveryTasks(userId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('discovery_tasks')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('DB error (getDiscoveryTasks):', error)
    return []
  }
  return data || []
}

export async function createDiscoveryTask(userId: string, keywords: string[], location: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('discovery_tasks')
    .insert({
      user_id: userId,
      keywords,
      location,
      status: 'pending'
    })
    .select()
    .single()

  if (error) {
    console.error('DB error (createDiscoveryTask):', error)
    return null
  }
  return data
}

export async function getActivityLogs(userId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('activity_logs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('DB error (getActivityLogs):', error)
    return []
  }
  return data || []
}
