import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ChangeEmailDto } from './dto/change-email.dto';
import {
  ForgotPasswordResetDto,
  ForgotPasswordSendCodeDto,
} from './dto/forgot-password.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly jwt: JwtService,
  ) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  /** 当前登录用户资料 */
  @Get('me')
  @ApiBearerAuth()
  async me(@Headers('authorization') authorization: string | undefined) {
    const userId = this.parseUserId(authorization);
    return this.authService.getMe(userId);
  }

  @Post('change-password')
  @ApiBearerAuth()
  async changePassword(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: ChangePasswordDto,
  ) {
    const userId = this.parseUserId(authorization);
    return this.authService.changePassword(userId, dto);
  }

  /** 自行绑定／更新邮箱 */
  @Post('change-email')
  @ApiBearerAuth()
  async changeEmail(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: ChangeEmailDto,
  ) {
    const userId = this.parseUserId(authorization);
    return this.authService.changeEmail(userId, dto);
  }

  /** 忘记密码：按登录账号向已绑定邮箱发送验证码 */
  @Post('forgot-password/send-code')
  sendForgotPasswordCode(@Body() dto: ForgotPasswordSendCodeDto) {
    return this.authService.sendForgotPasswordCode(dto);
  }

  /** 忘记密码：校验验证码并设置新密码 */
  @Post('forgot-password/reset')
  resetPasswordWithCode(@Body() dto: ForgotPasswordResetDto) {
    return this.authService.resetPasswordWithCode(dto);
  }

  private parseUserId(authorization?: string): string {
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing token');
    }
    try {
      const payload = this.jwt.verify<{ sub: string }>(authorization.slice(7));
      return payload.sub;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
