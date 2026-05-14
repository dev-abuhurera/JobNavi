import { getSimilarity } from './embeddings'
 
export interface UserProfile {
  userId?: string
  name?: string
  email?: string
  phone?: string
  resume_text?: string
  skills?: string[]
  experience_summary?: string
  desired_roles?: string[]
  preferred_tech?: string[]
}
 
/**
 * Converts a user profile into a semantic text representation for embedding.
 * This captures the essence of what the user is looking for.
 */
export function profileToSearchText(profile: UserProfile): string {
  const parts = [
    profile.desired_roles?.join(', ') || 'software developer',
    profile.preferred_tech?.join(', ') || '',
    profile.experience_summary || '',
    profile.skills?.slice(0, 8).join(', ') || '',
    profile.resume_text?.slice(0, 500) || ''
  ];
 
  return parts
    .filter(p => p && p.trim())
    .join('. ')
    .slice(0, 1500); // Increased limit slightly for better context
}
 
/**
 * Converts a job into semantic text for matching.
 */
export function jobToMatchText(job: any): string {
  return `${job.title} ${job.description || ''}`
    .slice(0, 1500);
}
 
/**
 * Calculates semantic similarity between a user profile and a job.
 */
export async function matchProfileToJob(
  profileText: string,
  job: any
): Promise<number> {
  try {
    const jobText = jobToMatchText(job);
    const similarity = await getSimilarity(profileText, jobText);
    return similarity;
  } catch (error) {
    console.error('[Matching] Profile-to-job similarity calculation failed:', error);
    return 0;
  }
}
 
/**
 * Filters jobs based on:
 * 1. Hard rejections (negative keywords in title)
 * 2. Vector similarity to user profile (threshold: 0.25)
 */
export async function filterJobsByProfile(
  jobs: any[],
  profileText: string,
  negativeKeywords: string[] = [
    'sales', 'hr', 'human resources', 'recruiter', 'recruitment',
    'admin', 'administrative', 'office manager', 'account executive',
    'customer support', 'tech support', 'customer service'
  ]
): Promise<any[]> {
  const SIMILARITY_THRESHOLD = 0.25;
  const filtered: any[] = [];
 
  for (const job of jobs) {
    const titleLower = (job.title || '').toLowerCase();
 
    // Step 1: Hard reject if negative keyword in title
    if (negativeKeywords.some(k => titleLower.includes(k))) {
      console.log(`[Match] Rejected "${job.title}" — matches negative keyword`);
      continue;
    }
 
    // Step 2: Vector similarity to profile
    const similarity = await matchProfileToJob(profileText, job);
    if (similarity > SIMILARITY_THRESHOLD) {
      filtered.push({
        ...job,
        similarity,
        fit_score: Math.round(similarity * 100)
      });
    } else {
      console.log(`[Match] Rejected "${job.title}" — low similarity (${similarity.toFixed(2)})`);
    }
  }
 
  return filtered.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
}
 
/**
 * Batch filter multiple jobs with profile caching.
 */
export async function batchFilterJobsByProfile(
  jobs: any[],
  profile: UserProfile,
  negativeKeywords?: string[]
): Promise<any[]> {
  const profileText = profileToSearchText(profile);
  console.log(`[Match] Filtering ${jobs.length} jobs against profile: "${profileText.slice(0, 60)}..."`);
  
  return filterJobsByProfile(jobs, profileText, negativeKeywords);
}
