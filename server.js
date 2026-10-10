const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cron = require('node-cron');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const requestRoutes = require('./routes/requestRoutes');
const spoRoutes = require('./routes/spoRoutes');

const Request = require('./models/Request');
const User = require('./models/user');
const { getHaversineDistance } = require('./utils/geo');
const { sendEmailAlert } = require('./utils/emailService');
const { addClient, removeClient, broadcastNotification } = require('./utils/sseService');

const app = express();
app.use(cors());
app.use(express.json());
app.get('/',(req,res) => {
    res.json({
        message: 'RakthaSetu Backend is running!',status:'OK'
    });
});

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/rakth_setu';

mongoose
  .connect(MONGO_URI)
  .then(() => console.log('MongoDB Connected: Rakth-Setu Backend Ready'))
  .catch((err) => console.error('MongoDB Connection Error:', err));

// SSE Endpoint for Live Top Notification Bar
app.get('/api/notifications/stream/:userId', (req, res) => {
  const { userId } = req.params;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  addClient(userId, res);

  req.on('close', () => {
    removeClient(userId);
  });
});

// Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/spo', spoRoutes);

// 25-Minute Escalation Cron Job
cron.schedule('* * * * *', async () => {
  try {
    const twentyFiveMinutesAgo = new Date(Date.now() - 25 * 60 * 1000);

    const stalledRequests = await Request.find({
      status: 'accepted',
      acceptedAt: { $lte: twentyFiveMinutesAgo },
    });

    for (let reqDoc of stalledRequests) {
      reqDoc.status = 'escalated';
      await reqDoc.save();

      const alternativeDonors = await User.find({
        _id: { $ne: reqDoc.acceptedBy },
        role: { $in: ['donor', 'nss_volunteer', 'blood_bank'] },
        isAvailableToDonate: true,
      });

      const secondaryTargetIds = [];
      for (let donor of alternativeDonors) {
        const dist = getHaversineDistance(
          reqDoc.location.latitude,
          reqDoc.location.longitude,
          donor.location.latitude,
          donor.location.longitude
        );

        if (dist <= 20.0) {
          secondaryTargetIds.push(donor._id);

          await sendEmailAlert(
            donor.email,
            `🚨 ESCALATED ALERT: Blood Needed Urgently (${reqDoc.bloodGroup})`,
            `The assigned donor did not respond within 25 minutes. Emergency assistance needed for ${reqDoc.patientName}.`,
            `<p><b>ESCALATED ALERT:</b> Assigned donor failed to respond within 25 minutes. Urgent blood request for <b>${reqDoc.patientName} (${reqDoc.bloodGroup})</b> within 20km.</p>`
          );
        }
      }

      broadcastNotification(secondaryTargetIds, {
        type: 'ESCALATED_REQUEST',
        requestId: reqDoc._id,
        message: `🚨 ESCALATION: Assigned donor inactive for 25 mins! Emergency ${reqDoc.bloodGroup} needed!`,
      });
    }
  } catch (err) {
    console.error('Error executing Escalation Stimulator Cron:', err);
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Rakth-Setu Production Server running on port ${PORT}`));