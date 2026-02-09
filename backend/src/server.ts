import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import productsRoutes from './routes/products.routes.js';
import ordersRoutes from './routes/orders.routes.js';
import customersRoutes from './routes/customers.routes.js';
import couponsRoutes from './routes/coupons.routes.js';
import authRoutes from './routes/auth.routes.js';
import placesRoutes from './routes/places.routes.js';

// Load .env from backend and project root
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/coupons', couponsRoutes);
app.use('/api/places', placesRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
