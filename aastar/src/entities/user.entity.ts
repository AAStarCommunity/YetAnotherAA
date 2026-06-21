import { Entity, Column, PrimaryColumn, CreateDateColumn, OneToMany } from "typeorm";
import { Account } from "./account.entity";
import { Transfer } from "./transfer.entity";
import { Passkey } from "./passkey.entity";
import { UserToken } from "./user-token.entity";
import { UserNFT } from "./user-nft.entity";

@Entity("users")
export class User {
  @PrimaryColumn()
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  username: string;

  /** Set true once the user proves email ownership via an OTP code. */
  @Column({ default: false })
  emailVerified: boolean;

  @Column({ nullable: true })
  walletAddress?: string;

  @Column({ nullable: true })
  kmsKeyId?: string;

  /** WebAuthn credential ID stored in KMS, used for wallet association */
  @Column({ nullable: true })
  kmsCredentialId?: string;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => Account, account => account.user)
  accounts: Account[];

  @OneToMany(() => Transfer, transfer => transfer.user)
  transfers: Transfer[];

  @OneToMany(() => Passkey, passkey => passkey.user)
  passkeys: Passkey[];

  @OneToMany(() => UserToken, userToken => userToken.user)
  userTokens: UserToken[];

  @OneToMany(() => UserNFT, userNFT => userNFT.user)
  userNFTs: UserNFT[];
}
