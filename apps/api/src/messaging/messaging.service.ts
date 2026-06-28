import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SendMessageDto } from './dto/send-message.dto';

type UserSummary = {
  id: string;
  phone: string;
  role: string;
  contractorProfile: { firstName: string; lastName: string; company: string | null } | null;
  supplierProfile: { businessName: string } | null;
  driverProfile: { firstName: string; lastName: string } | null;
};

const USER_SELECT = {
  id: true,
  phone: true,
  role: true,
  contractorProfile: true,
  supplierProfile: true,
  driverProfile: true,
} as const;

@Injectable()
export class MessagingService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async assertParticipant(userId: string, conversationId: string) {
    const participant = await this.prisma.conversationParticipant.findFirst({
      where: { conversationId, userId },
      select: { id: true },
    });

    if (!participant) {
      throw new ForbiddenException('You are not part of this conversation');
    }
  }

  async listConversations(userId: string) {
    const conversations = await this.prisma.conversation.findMany({
      where: {
        participants: {
          some: { userId },
        },
      },
      include: {
        order: {
          include: {
            project: true,
          },
        },
        participants: {
          include: {
            user: { select: USER_SELECT },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: { select: USER_SELECT },
            attachments: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return Promise.all(
      conversations.map(async (conversation) => {
        const me = conversation.participants.find((participant) => participant.userId === userId);
        const unreadCount = await this.prisma.message.count({
          where: {
            conversationId: conversation.id,
            senderId: { not: userId },
            ...(me?.lastReadAt ? { createdAt: { gt: me.lastReadAt } } : {}),
            reads: {
              none: { userId },
            },
          },
        });

        return {
          id: conversation.id,
          type: conversation.type,
          title: this.getConversationTitle(conversation.type),
          orderId: conversation.orderId,
          orderStatus: conversation.order.status,
          // Personal-purchase orders have no project, so fall back to the
          // recipient/shipping address for context.
          project: conversation.order.project
            ? {
                id: conversation.order.project.id,
                name: conversation.order.project.name,
                location: conversation.order.project.location,
              }
            : {
                id: null,
                name: conversation.order.recipientName || 'Personal purchase',
                location: conversation.order.shippingAddress?.split('\n')[0] || 'Personal purchase',
              },
          participants: conversation.participants.map((participant) =>
            this.toParticipantSummary(participant.user),
          ),
          lastMessage: conversation.messages[0]
            ? this.toMessageSummary(conversation.messages[0], userId)
            : null,
          unreadCount,
        };
      }),
    );
  }

  async getConversationForOrder(userId: string, orderId: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        orderId,
        type: 'ORDER_SHARED',
        participants: {
          some: { userId },
        },
      },
      select: { id: true },
    });

    if (!conversation) {
      throw new NotFoundException('Shared conversation not found for this order');
    }

    return this.getConversation(userId, conversation.id);
  }

  async getConversation(userId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        participants: {
          some: { userId },
        },
      },
      include: {
        order: {
          include: {
            project: true,
          },
        },
        participants: {
          include: {
            user: { select: USER_SELECT },
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            sender: { select: USER_SELECT },
            attachments: true,
            reads: {
              include: {
                user: { select: USER_SELECT },
              },
            },
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    return {
      id: conversation.id,
      type: conversation.type,
      title: this.getConversationTitle(conversation.type),
      orderId: conversation.orderId,
      orderStatus: conversation.order.status,
      project: conversation.order.project
        ? {
            id: conversation.order.project.id,
            name: conversation.order.project.name,
            location: conversation.order.project.location,
          }
        : {
            id: null,
            name: conversation.order.recipientName || 'Personal purchase',
            location: conversation.order.shippingAddress?.split('\n')[0] || 'Personal purchase',
          },
      participants: conversation.participants.map((participant) =>
        this.toParticipantSummary(participant.user),
      ),
      messages: conversation.messages.map((message) =>
        this.toMessagePayload(message, userId),
      ),
    };
  }

  async sendMessage(
    userId: string,
    conversationId: string,
    dto: SendMessageDto,
    files: Express.Multer.File[],
  ) {
    const participant = await this.prisma.conversationParticipant.findFirst({
      where: { conversationId, userId },
      include: {
        conversation: {
          include: {
            participants: {
              include: {
                user: { select: USER_SELECT },
              },
            },
          },
        },
        user: { select: USER_SELECT },
      },
    });

    if (!participant) {
      throw new ForbiddenException('You are not part of this conversation');
    }

    const content = dto.content?.trim();
    if (!content && files.length === 0) {
      throw new BadRequestException('Message content or an attachment is required');
    }

    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderId: userId,
        content: content || null,
        attachments: {
          create: files.map((file) => ({
            originalName: file.originalname,
            storedName: file.filename,
            mimeType: file.mimetype,
            size: file.size,
            url: `/uploads/message-attachments/${file.filename}`,
          })),
        },
      },
      include: {
        sender: { select: USER_SELECT },
        attachments: true,
        reads: {
          include: {
            user: { select: USER_SELECT },
          },
        },
      },
    });

    await this.prisma.conversationParticipant.update({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
      data: { lastReadAt: new Date() },
    });

    const senderName = this.getDisplayName(participant.user);
    const recipients = participant.conversation.participants.filter(
      (conversationParticipant) => conversationParticipant.userId !== userId,
    );
    const threadLabel = this.getConversationTitle(participant.conversation.type);

    await Promise.all(
      recipients.map((recipient) =>
        this.notifications.create(
          recipient.userId,
          `${threadLabel} on order #${participant.conversation.orderId.slice(-8).toUpperCase()}`,
          `${senderName}: ${content || `sent ${files.length} attachment${files.length > 1 ? 's' : ''}`}`,
          'INFO',
        ),
      ),
    );

    return {
      conversationId,
      conversationType: participant.conversation.type,
      orderId: participant.conversation.orderId,
      ...this.toMessagePayload(message, userId),
    };
  }

  async markConversationRead(userId: string, conversationId: string) {
    await this.assertParticipant(userId, conversationId);

    const unreadMessages = await this.prisma.message.findMany({
      where: {
        conversationId,
        senderId: { not: userId },
        reads: {
          none: { userId },
        },
      },
      select: { id: true },
    });

    for (const message of unreadMessages) {
      await this.prisma.messageRead.create({
        data: {
          messageId: message.id,
          userId,
          readAt: new Date(),
        },
      });
    }

    const readAt = new Date();
    await this.prisma.conversationParticipant.update({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
      data: { lastReadAt: readAt },
    });

    return { success: true, conversationId, userId, readAt };
  }

  private getConversationTitle(type: string) {
    switch (type) {
      case 'ORDER_PRIVATE_ADMIN_SUPPLIER':
        return 'Supplier-Admin Thread';
      default:
        return 'Order Thread';
    }
  }

  private toMessageSummary(
    message: {
      id: string;
      content: string | null;
      createdAt: Date;
      senderId: string;
      sender: UserSummary;
      attachments: { id: string }[];
    },
    userId: string,
  ) {
    return {
      id: message.id,
      content: message.content,
      createdAt: message.createdAt,
      sender: this.toParticipantSummary(message.sender),
      hasAttachments: message.attachments.length > 0,
      isOwn: message.senderId === userId,
    };
  }

  private toMessagePayload(
    message: {
      id: string;
      content: string | null;
      createdAt: Date;
      updatedAt: Date;
      senderId: string;
      sender: UserSummary;
      attachments: {
        id: string;
        originalName: string;
        mimeType: string | null;
        size: number;
        url: string;
      }[];
      reads: {
        userId: string;
        readAt: Date;
        user: UserSummary;
      }[];
    },
    userId: string,
  ) {
    return {
      id: message.id,
      content: message.content,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      sender: this.toParticipantSummary(message.sender),
      attachments: message.attachments.map((attachment) => ({
        id: attachment.id,
        originalName: attachment.originalName,
        mimeType: attachment.mimeType,
        size: attachment.size,
        url: attachment.url,
      })),
      readBy: message.reads
        .filter((read) => read.userId !== message.senderId)
        .map((read) => ({
          user: this.toParticipantSummary(read.user),
          readAt: read.readAt,
        })),
      isOwn: message.senderId === userId,
    };
  }

  private toParticipantSummary(user: UserSummary) {
    return {
      id: user.id,
      role: user.role,
      phone: user.phone,
      displayName: this.getDisplayName(user),
    };
  }

  private getDisplayName(user: UserSummary) {
    if (user.supplierProfile?.businessName) {
      return user.supplierProfile.businessName;
    }

    if (user.contractorProfile) {
      return `${user.contractorProfile.firstName} ${user.contractorProfile.lastName}`.trim();
    }

    if (user.driverProfile) {
      return `${user.driverProfile.firstName} ${user.driverProfile.lastName}`.trim();
    }

    if (user.role === 'ADMIN') {
      return 'Admin';
    }

    return user.phone;
  }
}
