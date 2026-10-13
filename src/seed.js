import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './models/user.model.js';

dotenv.config();

const seedProfiles = [
  {
    name: 'Ananya Sharma',
    email: 'ananya@example.com',
    password: 'password123',
    dateOfBirth: new Date('2001-05-15'),
    gender: 'female',
    genderPreference: 'male',
    city: 'Gandhinagar',
    state: 'Gujarat',
    bio: 'Coffee addict ☕ | Architect student in PDPU | Love evening walks at Sarita Udyan 🌿',
    interests: ['coffee', 'photography', 'travel', 'art'],
    datingIntent: 'Coffee date',
    onboardingCompleted: true,
    photos: [
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=600',
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?q=80&w=600',
    ],
  },
  {
    name: 'Rohan Patel',
    email: 'rohan@example.com',
    password: 'password123',
    dateOfBirth: new Date('1999-08-22'),
    gender: 'male',
    genderPreference: 'female',
    city: 'Gandhinagar',
    state: 'Gujarat',
    bio: 'Software Dev at GIFT City 💻 | Weekend Cyclist 🚴‍♂️ | Searching for good food and deep conversations.',
    interests: ['fitness', 'cooking', 'travel', 'gaming'],
    datingIntent: 'Long-term relationship',
    onboardingCompleted: true,
    photos: [
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=600',
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=600',
    ],
  },
  {
    name: 'Priya Joshi',
    email: 'priya@example.com',
    password: 'password123',
    dateOfBirth: new Date('2002-01-10'),
    gender: 'female',
    genderPreference: 'everyone',
    city: 'Gandhinagar',
    state: 'Gujarat',
    bio: 'DA-IICT grad student 📚 | Classical dancer 💃 | Let’s grab Boba tea in Sector 11!',
    interests: ['chai', 'books', 'music', 'art'],
    datingIntent: 'Casual dating',
    onboardingCompleted: true,
    photos: [
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=600',
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?q=80&w=600',
    ],
  },
  {
    name: 'Karan Mehta',
    email: 'karan@example.com',
    password: 'password123',
    dateOfBirth: new Date('1998-11-30'),
    gender: 'male',
    genderPreference: 'female',
    city: 'Gandhinagar',
    state: 'Gujarat',
    bio: 'Startup enthusiast 🚀 | Guitar player 🎸 | Always up for long drives around Akshardham.',
    interests: ['music', 'movies', 'coffee', 'travel'],
    datingIntent: 'Coffee date',
    onboardingCompleted: true,
    photos: [
      'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?q=80&w=600',
    ],
  },
];

const seedDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/date_app_db');
    console.log('Connected to MongoDB for seeding...');

    for (const data of seedProfiles) {
      const exists = await User.findOne({ email: data.email });
      if (!exists) {
        await User.create(data);
        console.log(`Created seed profile: ${data.name}`);
      } else {
        console.log(`Profile already exists: ${data.name}`);
      }
    }

    console.log('Seeding finished successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err.message);
    process.exit(1);
  }
};

seedDB();
