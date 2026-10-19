import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { z, ZodError } from 'zod';
import { HttpError, packetSchema, type User } from './contracts';
import type { Auth } from './auth';
import type { Repository } from './repository';
export function createApp(auth: Auth, repo: Repository, origins: string[]) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin: origins,
      methods: ['GET', 'POST', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
    }),
  );
  app.use(express.json({ limit: '256kb' }));
  app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'koda-mobile-api', contract: 1 });
  });
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Muitas tentativas. Tente novamente em alguns minutos.' },
  });
  app.post('/api/users/login', authLimiter, async (req, res) => {
    const input = z
      .object({ email: z.email(), password: z.string().min(1).max(1024) })
      .parse(req.body);
    const session = await auth.login(input.email, input.password);
    res.json({
      ...session,
      user: { ...session.user, ...(await repo.profileCenter(session.user.id)) },
    });
  });
  app.post('/api/users/refresh', authLimiter, async (req, res) => {
    const { refreshToken } = z
      .object({ refreshToken: z.string().min(1).max(8192) })
      .parse(req.body);
    const session = await auth.refresh(refreshToken);
    res.json({
      ...session,
      user: { ...session.user, ...(await repo.profileCenter(session.user.id)) },
    });
  });
  app.post('/api/users/logout', async (_req, res) => {
    await auth.logout();
    res.status(204).end();
  });
  app.use('/api', async (req, res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new HttpError(401, 'Entre na sua conta.');
    res.locals.user = await auth.profile(header.slice(7));
    next();
  });
  const driver = (res: Response) => (res.locals.user as User).id;
  const id = (req: Request) => z.coerce.number().int().positive().parse(req.params.id);
  app.get('/api/users/profile', async (_req, res) => {
    res.json({ ...res.locals.user, ...(await repo.profileCenter(driver(res))) });
  });
  app.get('/api/entregas/motorista', async (_req, res) => res.json(await repo.trips(driver(res))));
  app.get('/api/entregas/:id/completo', async (req, res) =>
    res.json(await repo.trip(driver(res), id(req))),
  );
  app.patch('/api/entregas/:id/iniciar', async (req, res) => {
    const input = z
      .object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        timestamp: z.iso.datetime(),
        sensorId: z.string().min(1).max(128).optional(),
      })
      .parse(req.body);
    res.json(await repo.start(driver(res), id(req), input, input.sensorId));
  });
  app.patch('/api/entregas/:id/sensor', async (req, res) => {
    const { sensorId } = z.object({ sensorId: z.string().min(1).max(128) }).parse(req.body);
    await repo.bindSensor(driver(res), id(req), sensorId);
    res.status(204).end();
  });
  app.get('/api/entregas/:id/telemetria', async (req, res) =>
    res.json(await repo.readings(driver(res), id(req))),
  );
  app.get('/api/entregas/:id/resumo', async (req, res) =>
    res.json(await repo.report(driver(res), id(req))),
  );
  app.get('/api/entregas/:id/contingencia', async (req, res) =>
    res.json(await repo.contingency(driver(res), id(req))),
  );
  app.post('/api/entregas/:id/finalizar', async (req, res) =>
    res.json(await repo.finish(driver(res), id(req))),
  );
  app.get('/api/alertas/motorista', async (_req, res) => res.json(await repo.alerts(driver(res))));
  app.post('/api/telemetria/lote', async (req, res) => {
    const { readings } = z
      .object({ readings: z.array(packetSchema).min(1).max(100) })
      .parse(req.body);
    if (readings.some((r) => r.driverId !== String(driver(res))))
      throw new HttpError(403, 'A fila pertence a outro motorista.');
    res.json(await repo.telemetry(driver(res), readings));
  });
  app.use((_req, res) => {
    res.status(404).json({ error: 'Rota mobile não encontrada.' });
  });
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    if (error instanceof ZodError) {
      res
        .status(400)
        .json({ error: 'Formato de dados inválido. Verifique os campos ou o contrato da API.' });
      return;
    }
    res.status(500).json({ error: 'Não foi possível concluir a operação.' });
  });
  return app;
}
