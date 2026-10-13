import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import User from '../models/user.model.js';
import { connectDB } from '../config/db.js';

dotenv.config();

const cleanLocationData = async () => {
  try {
    console.log('🔄 Connecting to MongoDB for location cleanup migration...');
    await connectDB();

    console.log('🧹 Cleaning stored GPS coordinates and location fields from User documents...');
    const result = await mongoose.connection.collection('users').updateMany(
      {},
      {
        $unset: {
          location: '',
          latitude: '',
          longitude: '',
        },
      }
    );

    console.log(`✅ Location cleanup migration completed successfully!`);
    console.log(`📊 Matched & updated documents: ${result.modifiedCount || result.nModified || 0}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration error:', error.message);
    process.exit(1);
  }
};

cleanLocationData();
