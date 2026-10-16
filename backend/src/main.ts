import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix('api');
  // 本地 Vite / 无入口 Nginx 时：/files/* → uploads（与 Docker Nginx /files/ 路径一致）
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/files/',
    maxAge: '7d',
    index: false,
  });
  app.enableCors({
    origin: (() => {
      const raw = process.env.CORS_ORIGIN?.trim();
      if (!raw) return true;
      return raw.split(',').map((s) => s.trim()).filter(Boolean);
    })(),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const swagger = new DocumentBuilder()
    .setTitle('Leapbud Lease API')
    .setDescription('Lease management backend')
    .setVersion('0.1.0')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swagger));

  const port = Number(process.env.PORT || 3000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API http://127.0.0.1:${port}/api  Swagger http://127.0.0.1:${port}/api/docs`);
  // eslint-disable-next-line no-console
  console.log(`Files http://127.0.0.1:${port}/files/  (uploads)`);
}

bootstrap();
