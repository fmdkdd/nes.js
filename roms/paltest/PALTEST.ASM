;full palette display
;========================
.mem 8
.index 8
.opt on

CR0     = $2000
CR1     = $2001
STAT    = $2002
OAMADDR = $2003
OAMDATA = $2004
SCROLL  = $2005
VADDR   = $2006
VDATA   = $2007
OAMDMA  = $4014
JOY0    = $4016
JOY1    = $4017

        .org $8000
chr     .incbin chr.chr
        .pad $c000

reset;===================
        sei                     ;no irq
        ldx #$00
        stx CR0                 ;no NMI
        stx CR1                 ;screen off
        dex
        txs                     ;reset stack

        lda #0                  ;reset MMC1
        ldx #1
        inc $fffd
        sta $8000
        stx $8000
        stx $8000
        stx $8000
        sta $8000
        sta $e000
        sta $e000
        sta $e000
        sta $e000
        sta $e000

-       lda STAT : bpl -  
-       lda STAT : bpl -  

        lda #$00                ;load chr
        sta $00
        sta VADDR
        sta VADDR
        lda #(chr>>8)
        sta $01
        ldx #$20
        ldy #$00
-       lda ($00),y
        sta VDATA
        iny
        bne -
        inc $01
        dex
        bne -

        lda #$20                ;setup bg
        sta VADDR
        lda #$00
        sta VADDR
        lda #30
---     ldx #0
--      ldy #8
-       stx VDATA
        dey
        bne -
        inx
        cpx #4
        bne --
        sec
        sbc #1
        bne ---

        lda #$00
        ldx #$40
-       sta VDATA
        dex
        bne -

        lda #$80                ;nmi on
        sta CR0
        lda #$00                ;reset scroll
        sta SCROLL
        sta SCROLL

-       lda STAT : bpl -  
nmi;=====================
        ldx #1
        stx JOY0
        dex
        stx JOY0

        stx $01                 ;blah blah blah
        lda JOY0
        lsr
        ror $01
        lda JOY0
        lsr
        ror $01
        ldx JOY0
        lda JOY0
        lsr
        ror $01
        txa
        and #1
        ora $01
        sta $02                 ;$02=(screen off)
        ora #%00001010          ;got flags for $2001..
        sta $01                 ;$01=(screen on)

        ldx #0                  ;X=0
        ldy #$00                ;Y=palette base
        lda #$40
        sta $00                 ;$00=delay count

-       inc $00                 ;wait a while (top of screen delay)
        bne -

-       inc $00                 ;wait some more (midscreen delay)
        bne -

        lda $02                         ;screen off
        sta CR1
        lda #$3f
        sta $00                         ;reset delay count
        sta VADDR                       ;point to palette
        stx VADDR
        tya
        sta VDATA                       ;update pal
        adc #$10
        sta VDATA
        adc #$10
        sta VDATA
        adc #$10
        sta VDATA
        iny                             ;update pal index
        stx VADDR                       ;reset scroll
        stx VADDR
        lda $01
        sta CR1                         ;screen on
        jmp -
irq;====================
        rti
;=======================
        .pad $fffa
        .dcw nmi
        .dcw reset
        .dcw irq
