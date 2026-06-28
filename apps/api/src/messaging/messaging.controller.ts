import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { JwtPayload } from '@cscp/types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MessagingGateway } from './messaging.gateway';
import { MessagingService } from './messaging.service';
import { SendMessageDto } from './dto/send-message.dto';

const attachmentStorage = diskStorage({
  destination: join(process.cwd(), 'uploads', 'message-attachments'),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `msg-${unique}${extname(file.originalname)}`);
  },
});

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagingController {
  constructor(
    private messagingService: MessagingService,
    private messagingGateway: MessagingGateway,
  ) {}

  @Get('conversations')
  listConversations(@CurrentUser() user: JwtPayload) {
    return this.messagingService.listConversations(user.sub);
  }

  @Get('orders/:orderId')
  getConversationForOrder(
    @CurrentUser() user: JwtPayload,
    @Param('orderId') orderId: string,
  ) {
    return this.messagingService.getConversationForOrder(user.sub, orderId);
  }

  @Get('conversations/:conversationId')
  getConversation(
    @CurrentUser() user: JwtPayload,
    @Param('conversationId') conversationId: string,
  ) {
    return this.messagingService.getConversation(user.sub, conversationId);
  }

  @Post('conversations/:conversationId/messages')
  @UseInterceptors(
    FilesInterceptor('attachments', 5, {
      storage: attachmentStorage,
    }),
  )
  sendMessage(
    @CurrentUser() user: JwtPayload,
    @Param('conversationId') conversationId: string,
    @Body() dto: SendMessageDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.messagingService
      .sendMessage(user.sub, conversationId, dto, files || [])
      .then((message) => {
        this.messagingGateway.emitNewMessage(conversationId, message);
        return message;
      });
  }

  @Post('conversations/:conversationId/read')
  markConversationRead(
    @CurrentUser() user: JwtPayload,
    @Param('conversationId') conversationId: string,
  ) {
    return this.messagingService.markConversationRead(user.sub, conversationId).then((result) => {
      this.messagingGateway.emitConversationRead(conversationId, result);
      return result;
    });
  }
}
