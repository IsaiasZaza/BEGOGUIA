import cors from 'cors';
import express from 'express';
import { config } from './config';
import { errorHandler } from './middleware/error-handler';
import { adminRouter } from './routes/admin';
import { authRouter } from './routes/auth';
import { conversasRouter } from './routes/conversas';
import { guiaRouter } from './routes/guia';
import { guiasRouter } from './routes/guias';
import { notificacoesRouter } from './routes/notificacoes';
import { reservasRouter } from './routes/reservas';
import { roteirosRouter } from './routes/roteiros';
import { turistaRouter } from './routes/turista';
import { usuarioRouter } from './routes/usuario';

export const app = express();

app.disable('x-powered-by');

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || config.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  }),
);

app.use(express.json({ limit: '1mb' }));

app.use(
  '/uploads',
  express.static(config.uploadDir, {
    fallthrough: false,
    index: false,
    dotfiles: 'deny',
  }),
);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/auth', authRouter);
app.use('/roteiros', roteirosRouter);
app.use('/guias', guiasRouter);
app.use('/notificacoes', notificacoesRouter);
app.use('/admin', adminRouter);
app.use('/turista', turistaRouter);
app.use('/usuario', usuarioRouter);
app.use('/reservas', reservasRouter);
app.use('/guia', guiaRouter);
app.use('/conversas', conversasRouter);

app.use((_req, res) => {
  res.status(404).json({ message: 'Rota não encontrada', code: 'NOT_FOUND' });
});

app.use(errorHandler);
