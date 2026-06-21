import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsString, Length, Matches } from "class-validator";

export class RequestOtpDto {
  @ApiProperty({ example: "user@example.com" })
  @IsEmail()
  email: string;
}

export class VerifyOtpDto {
  @ApiProperty({ example: "user@example.com" })
  @IsEmail()
  email: string;

  @ApiProperty({ example: "123456", description: "6-digit code sent to the email" })
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: "code must be 6 digits" })
  code: string;
}
