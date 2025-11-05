import type { InterviewQuestion } from '../types/interview'

export const INTERVIEW_QUESTIONS: string[] = [
  "Hello! Thank you for joining today's interview. Please start by introducing yourself and telling me a bit about your background.",
  
  "What interests you most about this position, and why do you think you'd be a good fit for our team?",
  
  "Can you describe a challenging project or situation you've worked on recently? How did you approach it and what was the outcome?",
  
  "Where do you see yourself professionally in the next few years, and how does this role align with your career goals?",
  
  "Do you have any questions about the role, our company, or anything else you'd like to know? Thank you for your time today!"
]

export const DETAILED_INTERVIEW_QUESTIONS: InterviewQuestion[] = [
  {
    id: 'intro_1',
    text: "Hello! Thank you for joining today's interview. Please start by introducing yourself and telling me a bit about your background.",
    type: 'introduction',
    category: 'personal',
    difficulty: 'easy',
    timeLimit: 120
  },
  {
    id: 'interest_1',
    text: "What interests you most about this position, and why do you think you'd be a good fit for our team?",
    type: 'behavioral',
    category: 'motivation',
    difficulty: 'medium',
    timeLimit: 180
  },
  {
    id: 'experience_1',
    text: "Can you describe a challenging project or situation you've worked on recently? How did you approach it and what was the outcome?",
    type: 'situational',
    category: 'problem-solving',
    difficulty: 'medium',
    timeLimit: 240
  },
  {
    id: 'goals_1',
    text: "Where do you see yourself professionally in the next few years, and how does this role align with your career goals?",
    type: 'behavioral',
    category: 'career-development',
    difficulty: 'medium',
    timeLimit: 150
  },
  {
    id: 'closing_1',
    text: "Do you have any questions about the role, our company, or anything else you'd like to know? Thank you for your time today!",
    type: 'closing',
    category: 'wrap-up',
    difficulty: 'easy',
    timeLimit: 180
  }
]

// Technical interview questions for specific roles
export const TECHNICAL_QUESTIONS: Record<string, InterviewQuestion[]> = {
  software_engineer: [
    {
      id: 'tech_se_1',
      text: "Can you explain the difference between synchronous and asynchronous programming? When would you use each approach?",
      type: 'technical',
      category: 'programming-concepts',
      difficulty: 'medium',
      timeLimit: 180
    },
    {
      id: 'tech_se_2',
      text: "How would you optimize a slow database query? Walk me through your debugging process.",
      type: 'technical',
      category: 'performance',
      difficulty: 'hard',
      timeLimit: 300
    }
  ],
  
  data_scientist: [
    {
      id: 'tech_ds_1',
      text: "How would you handle missing data in a dataset? What are the different approaches and when would you use each?",
      type: 'technical',
      category: 'data-processing',
      difficulty: 'medium',
      timeLimit: 240
    },
    {
      id: 'tech_ds_2',
      text: "Explain the bias-variance tradeoff and how it affects machine learning model performance.",
      type: 'technical',
      category: 'machine-learning',
      difficulty: 'hard',
      timeLimit: 300
    }
  ],
  
  product_manager: [
    {
      id: 'tech_pm_1',
      text: "How would you prioritize features for a product roadmap when you have competing stakeholder demands?",
      type: 'technical',
      category: 'product-strategy',
      difficulty: 'medium',
      timeLimit: 240
    },
    {
      id: 'tech_pm_2',
      text: "Walk me through how you would launch a new product feature. What metrics would you track?",
      type: 'technical',
      category: 'product-execution',
      difficulty: 'hard',
      timeLimit: 300
    }
  ]
}

// Behavioral questions focused on soft skills
export const BEHAVIORAL_QUESTIONS: InterviewQuestion[] = [
  {
    id: 'behav_1',
    text: "Tell me about a time when you had to work with a difficult team member. How did you handle the situation?",
    type: 'behavioral',
    category: 'teamwork',
    difficulty: 'medium',
    timeLimit: 180
  },
  {
    id: 'behav_2',
    text: "Describe a situation where you had to learn something completely new under pressure. How did you approach it?",
    type: 'behavioral',
    category: 'adaptability',
    difficulty: 'medium',
    timeLimit: 200
  },
  {
    id: 'behav_3',
    text: "Can you give me an example of a time when you made a mistake? How did you handle it and what did you learn?",
    type: 'behavioral',
    category: 'accountability',
    difficulty: 'medium',
    timeLimit: 180
  },
  {
    id: 'behav_4',
    text: "Tell me about a time when you had to persuade someone to see things your way. What was your approach?",
    type: 'behavioral',
    category: 'communication',
    difficulty: 'medium',
    timeLimit: 200
  }
]

// Questions for different experience levels
export const EXPERIENCE_LEVEL_QUESTIONS: Record<string, InterviewQuestion[]> = {
  entry_level: [
    {
      id: 'entry_1',
      text: "What projects or coursework are you most proud of, and what did you learn from them?",
      type: 'behavioral',
      category: 'experience',
      difficulty: 'easy',
      timeLimit: 150
    },
    {
      id: 'entry_2',
      text: "How do you stay updated with industry trends and continue learning new skills?",
      type: 'behavioral',
      category: 'learning',
      difficulty: 'easy',
      timeLimit: 120
    }
  ],
  
  mid_level: [
    {
      id: 'mid_1',
      text: "Tell me about a time when you had to take ownership of a project or initiative. What was the outcome?",
      type: 'behavioral',
      category: 'leadership',
      difficulty: 'medium',
      timeLimit: 200
    },
    {
      id: 'mid_2',
      text: "How do you balance competing priorities and manage your time effectively?",
      type: 'behavioral',
      category: 'time-management',
      difficulty: 'medium',
      timeLimit: 180
    }
  ],
  
  senior_level: [
    {
      id: 'senior_1',
      text: "Describe your approach to mentoring junior team members. Can you give me a specific example?",
      type: 'behavioral',
      category: 'mentorship',
      difficulty: 'hard',
      timeLimit: 240
    },
    {
      id: 'senior_2',
      text: "How do you approach making strategic decisions when you have incomplete information?",
      type: 'behavioral',
      category: 'decision-making',
      difficulty: 'hard',
      timeLimit: 300
    }
  ]
}

// Helper function to generate a customized interview question set
export function generateInterviewQuestions(
  role?: string,
  experienceLevel?: string,
  includeBehavioral: boolean = true,
  includeTechnical: boolean = true,
  maxQuestions: number = 5
): InterviewQuestion[] {
  const questions: InterviewQuestion[] = []
  
  // Always start with introduction
  questions.push(DETAILED_INTERVIEW_QUESTIONS[0])
  
  // Add role-specific technical questions
  if (includeTechnical && role && TECHNICAL_QUESTIONS[role]) {
    questions.push(...TECHNICAL_QUESTIONS[role].slice(0, 2))
  }
  
  // Add experience-level questions
  if (experienceLevel && EXPERIENCE_LEVEL_QUESTIONS[experienceLevel]) {
    questions.push(...EXPERIENCE_LEVEL_QUESTIONS[experienceLevel].slice(0, 1))
  }
  
  // Add behavioral questions
  if (includeBehavioral) {
    questions.push(...BEHAVIORAL_QUESTIONS.slice(0, 1))
  }
  
  // Always end with closing question
  questions.push(DETAILED_INTERVIEW_QUESTIONS[4])
  
  return questions.slice(0, maxQuestions)
}